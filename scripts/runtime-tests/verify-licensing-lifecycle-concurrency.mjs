import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  assertLocalTarget,
  blocked,
  closeAll,
  failed,
  observe,
  open,
  readHistoryPreflight,
} from "./local-db-harness.mjs";

// F2D5B local concurrency: Tenant -> License lock order, stale revisions,
// terminate/create on one Tenant and Tenant mutations racing lifecycle RPCs.
assertLocalTarget(process.argv);

let passed = 0;
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}
const tenants = [0, 1, 2, 3, 4, 5, 6].map(() => randomUUID());
const actor = randomUUID();
const auth =
  "set local role authenticated; select set_config('request.jwt.claim','',true); select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','" +
  JSON.stringify({ sub: actor, aal: "aal2" }) +
  "',true);";
const call = (fn, license, revision) =>
  "select id from public." + fn + "('" + license + "'," + revision + ");";

try {
  const a = await open();
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
          (t) =>
            "insert into public.tenants(id,category,legal_name,created_by,updated_by) values('" +
            t +
            "','internal','Local lifecycle concurrency','" +
            actor +
            "','" +
            actor +
            "');",
        )
        .join("") +
      "commit;",
  );
  for (const [index, tenant] of tenants.entries()) {
    await a.run(
      "begin;" +
        auth +
        "select id from public.create_license('" +
        tenant +
        "','mini');" +
        (index === 3
          ? ""
          : "select 1 from public.activate_license((select id from public.licenses where tenant_id='" +
            tenant +
            "'),1);") +
        "commit;",
    );
  }
  const id = [];
  for (const tenant of tenants) {
    id.push(
      await observer.run(
        "select id from public.licenses where tenant_id='" + tenant + "';",
      ),
    );
  }
  id.forEach((value) => assert.match(value, /^[0-9a-f-]{36}$/));

  // 1. Same license, same expected revision: second waits, then conflict.
  let b = await open();
  await a.run("begin;" + auth + call("suspend_license", id[0], 2));
  let pending = observe(
    b.run("begin;" + auth + call("suspend_license", id[0], 2) + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "conflict");
  pass("parallel suspend waits then stale revision is conflict");

  // 2. First rolls back: waiting mutation succeeds, decision time after wait.
  b = await open();
  await a.run("begin;" + auth + call("suspend_license", id[1], 2));
  pending = observe(
    b.run("begin;" + auth + call("suspend_license", id[1], 2) + "commit;"),
  );
  await blocked(observer, b);
  const beforeRelease = await observer.run("select clock_timestamp()::text;");
  await a.run("rollback;");
  assert.ok(!(await pending).error);
  pass("waiting suspend succeeds after first rollback");
  assert.equal(
    await observer.run(
      "select status='suspended' and revision=3 and updated_at >= '" +
        beforeRelease +
        "'::timestamptz from public.licenses where id='" +
        id[1] +
        "';",
    ),
    "t",
  );
  pass("decision time is captured after actual lock wait");

  // 3. Terminate and create on one Tenant serialize; create sees the freed slot.
  await a.run("begin;" + auth + call("terminate_license", id[2], 2));
  pending = observe(
    b.run(
      "begin;" +
        auth +
        "select id from public.create_license('" +
        tenants[2] +
        "','mini'); commit;",
    ),
  );
  await blocked(observer, b);
  await a.run("commit;");
  assert.ok(!(await pending).error);
  assert.equal(
    await observer.run(
      "select string_agg(status,',' order by created_at) from public.licenses where tenant_id='" +
        tenants[2] +
        "';",
    ),
    "terminated,draft",
  );
  pass("parallel terminate/create serializes on Tenant and preserves history");

  // 4. In-flight Tenant pause blocks activation, which then sees unavailability.
  await a.run(
    "begin;" +
      auth +
      "select id from public.pause_tenant('" +
      tenants[3] +
      "',1);",
  );
  pending = observe(
    b.run("begin;" + auth + call("activate_license", id[3], 1) + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "tenant_not_available");
  pass("activation waits for Tenant pause then is tenant_not_available");

  // 5. In-flight Tenant pause delays but never blocks suspend.
  b = await open();
  await a.run(
    "begin;" +
      auth +
      "select id from public.pause_tenant('" +
      tenants[4] +
      "',1);",
  );
  pending = observe(
    b.run("begin;" + auth + call("suspend_license", id[4], 2) + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  assert.ok(!(await pending).error);
  pass("suspend waits for Tenant pause then succeeds on paused Tenant");

  // 6. Different Tenants are not globally serialized.
  await a.run("begin;" + auth + call("suspend_license", id[5], 2));
  await b.run("begin;" + auth + call("suspend_license", id[6], 2) + "commit;");
  await a.run("commit;");
  pass("lifecycle on different Tenants commits without global serialization");

  assert.equal(
    await observer.run(
      "select count(*)=8 and bool_and(l.revision=(select count(*) from public.license_audit_events a where a.license_id=l.id)) from public.licenses l;",
    ),
    "t",
  );
  await observer.run("begin;" + readHistoryPreflight() + "commit;");
  pass("all committed graphs satisfy exact F2D4 preflight");
  console.log(
    "Local lifecycle concurrency: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  closeAll();
}
