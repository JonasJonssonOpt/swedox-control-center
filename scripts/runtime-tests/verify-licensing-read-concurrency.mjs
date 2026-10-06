import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  assertLocalTarget,
  blocked,
  closeAll,
  open,
  readHistoryPreflight,
} from "./local-db-harness.mjs";

// F2D6 local concurrency: read surfaces never wait on Licensing write locks,
// see one committed snapshot, and keyset pages stay stable under inserts.
assertLocalTarget(process.argv);

let passed = 0;
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}
const tenants = [0, 1, 2].map(() => randomUUID());
const actor = randomUUID();
const auth =
  "set local role authenticated; select set_config('request.jwt.claim','',true); select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','" +
  JSON.stringify({ sub: actor, aal: "aal2" }) +
  "',true);";

// One owner+AAL2 read in its own transaction; returns only the query output.
async function read(session, sql) {
  await session.run("begin;" + auth);
  try {
    return await session.run(sql);
  } finally {
    await session.run("rollback;");
  }
}
const eligibility = (tenant) =>
  "select reason from public.get_license_provisioning_eligibility('" +
  tenant +
  "');";

try {
  const a = await open();
  const reader = await open();
  const observer = await open();
  assert.equal(
    await a.run("select count(*) from public.licenses;"),
    "0",
    "fresh reset required",
  );
  assert.equal(
    await a.run("select count(*) from public.control_center_owner;"),
    "0",
    "no existing owner fixture",
  );
  await a.run(
    "begin; insert into auth.users(id) values('" +
      actor +
      "'); insert into public.control_center_owner(owner_user_id) values('" +
      actor +
      "');" +
      tenants
        .map(
          (t, index) =>
            "insert into public.tenants(id,category,legal_name,created_by,updated_by) values('" +
            t +
            "','internal','Local read concurrency " +
            index +
            "','" +
            actor +
            "','" +
            actor +
            "');",
        )
        .join("") +
      "commit;",
  );
  for (const tenant of tenants.slice(0, 2)) {
    await a.run(
      "begin;" +
        auth +
        "select id from public.create_license('" +
        tenant +
        "','mini');" +
        "select 1 from public.activate_license((select id from public.licenses where tenant_id='" +
        tenant +
        "'),1); commit;",
    );
  }
  const id = [];
  for (const tenant of tenants.slice(0, 2)) {
    id.push(
      await observer.run(
        "select id from public.licenses where tenant_id='" + tenant + "';",
      ),
    );
  }
  id.forEach((value) => assert.match(value, /^[0-9a-f-]{36}$/));

  // 1. An in-flight suspend holds License FOR NO KEY UPDATE: every read
  //    surface answers without waiting and shows the committed state.
  await a.run(
    "begin;" +
      auth +
      "select id from public.suspend_license('" +
      id[0] +
      "',2);",
  );
  assert.equal(await read(reader, eligibility(tenants[0])), "eligible");
  assert.equal(
    await read(
      reader,
      "select status||'/'||revision from public.get_license('" + id[0] + "');",
    ),
    "active/2",
  );
  assert.equal(
    await read(
      reader,
      "select status from public.list_licenses(p_tenant_id=>'" +
        tenants[0] +
        "');",
    ),
    "active",
  );
  assert.equal(
    await read(
      reader,
      "select count(*) from public.list_license_audit_events('" + id[0] + "');",
    ),
    "2",
  );
  assert.equal(
    await read(
      reader,
      "select count(*) from public.list_license_terms_versions('" +
        id[0] +
        "');",
    ),
    "1",
  );
  pass("reads do not wait on an in-flight license mutation");

  // 2. After commit the next read sees the new state; nothing was stored.
  await a.run("commit;");
  assert.equal(await read(reader, eligibility(tenants[0])), "suspended");
  assert.equal(
    await read(
      reader,
      "select count(*) from public.list_license_audit_events('" + id[0] + "');",
    ),
    "3",
  );
  pass("committed mutation is visible to the next read");

  // 3. An in-flight Tenant pause holds the Tenant row lock: eligibility does
  //    not wait, reports the committed availability, then tenant_unavailable.
  await a.run(
    "begin;" +
      auth +
      "select id from public.pause_tenant('" +
      tenants[1] +
      "',1);",
  );
  assert.equal(await read(reader, eligibility(tenants[1])), "eligible");
  await a.run("commit;");
  assert.equal(
    await read(reader, eligibility(tenants[1])),
    "tenant_unavailable",
  );
  pass("eligibility does not wait on Tenant pause and follows its commit");

  // 4. A waiting writer is not blocked by an open read transaction either.
  await reader.run("begin;" + auth);
  await reader.run(eligibility(tenants[0]));
  const writer = await open();
  await writer.run(
    "begin;" +
      auth +
      "select id from public.activate_license('" +
      id[0] +
      "',3); commit;",
  );
  await reader.run("rollback;");
  assert.equal(await read(reader, eligibility(tenants[0])), "eligible");
  pass("open read transaction does not block a license mutation");

  // 5. Keyset continuation stays stable when a newer license commits between pages.
  const first = (
    await read(
      reader,
      "select id||'|'||evaluated_at||'|'||coalesce(next_cursor_created_at::text,'')||'|'||coalesce(next_cursor_id::text,'') from public.list_licenses(1);",
    )
  ).split("|");
  assert.equal(first[0], id[1], "newest license first");
  await a.run(
    "begin;" +
      auth +
      "select id from public.create_license('" +
      tenants[2] +
      "','stor'); commit;",
  );
  const second = await read(
    reader,
    "select string_agg(id::text,',') from public.list_licenses(10,'" +
      first[1] +
      "','" +
      first[2] +
      "','" +
      first[3] +
      "');",
  );
  assert.equal(second, id[0], "continuation has no duplicate and no skip");
  assert.equal(
    await read(reader, "select count(*) from public.list_licenses();"),
    "3",
    "a new series sees the inserted license",
  );
  pass("keyset continuation is stable under a concurrent insert");

  // 6. A blocked mutation shows reads never appear in lock waits.
  await a.run(
    "begin;" +
      auth +
      "select id from public.suspend_license('" +
      id[0] +
      "',4);",
  );
  const contender = await open();
  const pending = contender
    .run(
      "begin;" +
        auth +
        "select id from public.suspend_license('" +
        id[0] +
        "',4); commit;",
    )
    .then(
      () => ({}),
      (error) => ({ error }),
    );
  await blocked(observer, contender);
  assert.equal(await read(reader, eligibility(tenants[0])), "eligible");
  await a.run("rollback;");
  assert.ok(!(await pending).error);
  assert.equal(await read(reader, eligibility(tenants[0])), "suspended");
  pass("reads proceed while writers queue on the same license");

  await observer.run("begin;" + readHistoryPreflight() + "commit;");
  pass("all committed graphs satisfy exact F2D4 preflight");
  console.log(
    "Local read concurrency: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  closeAll();
}
