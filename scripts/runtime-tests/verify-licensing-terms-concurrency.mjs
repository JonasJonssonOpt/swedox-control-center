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

// F2D5C local concurrency: terms change and renewal under Tenant -> License locks.
assertLocalTarget(process.argv);

let passed = 0;
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}
const tenants = [0, 1, 2, 3, 4, 5].map(() => randomUUID());
const endedLicense = randomUUID();
const actor = randomUUID();
const auth =
  "set local role authenticated; select set_config('request.jwt.claim','',true); select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','" +
  JSON.stringify({ sub: actor, aal: "aal2" }) +
  "',true);";
const changeTerms = (license, revision, plan) =>
  "select id from public.change_license_terms('" +
  license +
  "'," +
  revision +
  ",'" +
  plan +
  "');";
const renew = (license, revision, end) =>
  "select id from public.renew_license('" +
  license +
  "'," +
  revision +
  "," +
  end +
  ");";

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
            "','internal','Local terms concurrency','" +
            actor +
            "','" +
            actor +
            "');",
        )
        .join("") +
      "commit;",
  );
  // Active finite licenses through the product RPCs; Tenant 3 gets an ended
  // interval fixture because create_license cannot backdate.
  for (const [index, tenant] of tenants.entries()) {
    if (index === 3) continue;
    await a.run(
      "begin;" +
        auth +
        "select id from public.create_license('" +
        tenant +
        "','mini',null,clock_timestamp()+interval '30 days');" +
        "select 1 from public.activate_license((select id from public.licenses where tenant_id='" +
        tenant +
        "'),1); commit;",
    );
  }
  await a.run(
    "begin; insert into public.licenses(id,tenant_id,status,created_by,updated_by) values('" +
      endedLicense +
      "','" +
      tenants[3] +
      "','active','" +
      actor +
      "','" +
      actor +
      "'); insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields) values('" +
      endedLicense +
      "','license_created','" +
      actor +
      "',1,array['id','tenant_id','status','revision']); insert into public.license_terms_versions values('" +
      endedLicense +
      "',1,1,'mini',1,'Mini',24,'2020-01-01','2021-01-01'); commit;",
  );
  const id = [];
  for (const tenant of tenants) {
    id.push(
      await observer.run(
        "select id from public.licenses where tenant_id='" + tenant + "';",
      ),
    );
  }
  id.forEach((value) => assert.match(value, /^[0-9a-f-]{36}$/));

  // 1. Same license and revision: second terms change waits, then conflict.
  let b = await open();
  await a.run("begin;" + auth + changeTerms(id[0], 2, "standard"));
  let pending = observe(
    b.run("begin;" + auth + changeTerms(id[0], 2, "stor") + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "conflict");
  assert.equal(
    await observer.run(
      "select string_agg(plan_key,',' order by version) from public.license_terms_versions where license_id='" +
        id[0] +
        "';",
    ),
    "mini,standard",
  );
  pass("parallel terms change waits then conflict without a second version");

  // 2. First rolls back: waiting terms change succeeds as version 2.
  b = await open();
  await a.run("begin;" + auth + changeTerms(id[1], 2, "standard"));
  pending = observe(
    b.run("begin;" + auth + changeTerms(id[1], 2, "stor") + "commit;"),
  );
  await blocked(observer, b);
  await a.run("rollback;");
  assert.ok(!(await pending).error);
  assert.equal(
    await observer.run(
      "select current_terms_version||':'||(select plan_key from public.license_terms_versions t where t.license_id=l.id and t.version=l.current_terms_version) from public.licenses l where id='" +
        id[1] +
        "';",
    ),
    "2:stor",
  );
  pass("waiting terms change succeeds after first rollback");

  // 3. Suspend in flight: parallel renewal with the same revision is a conflict.
  b = await open();
  await a.run(
    "begin;" +
      auth +
      "select id from public.suspend_license('" +
      id[2] +
      "',2);",
  );
  pending = observe(
    b.run(
      "begin;" +
        auth +
        renew(id[2], 2, "clock_timestamp()+interval '60 days'") +
        "commit;",
    ),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "conflict");
  pass("parallel suspend/renew serializes; stale renewal is conflict");

  // 4. Ended renewal: the new period starts after the actual lock wait.
  b = await open();
  await a.run(
    "begin; select 1 from public.tenants where id='" +
      tenants[3] +
      "' for no key update;",
  );
  pending = observe(
    b.run("begin;" + auth + renew(id[3], 1, "null") + "commit;"),
  );
  await blocked(observer, b);
  const beforeRelease = await observer.run("select clock_timestamp()::text;");
  await a.run("commit;");
  assert.ok(!(await pending).error);
  assert.equal(
    await observer.run(
      "select t.valid_from >= '" +
        beforeRelease +
        "'::timestamptz and t.valid_from=l.updated_at and t.valid_until is null from public.licenses l join public.license_terms_versions t on t.license_id=l.id and t.version=l.current_terms_version where l.id='" +
        id[3] +
        "';",
    ),
    "t",
  );
  pass("ended renewal starts at decision time after lock wait");

  // 5. In-flight Tenant pause blocks a terms change, which then sees unavailability.
  await a.run(
    "begin;" +
      auth +
      "select id from public.pause_tenant('" +
      tenants[4] +
      "',1);",
  );
  pending = observe(
    b.run("begin;" + auth + changeTerms(id[4], 2, "mini2") + "commit;"),
  );
  // Invalid plan is rejected before any lock; prove that path does not wait.
  failed(await pending, "validation_error");
  b = await open();
  pending = observe(
    b.run("begin;" + auth + changeTerms(id[4], 2, "standard") + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "tenant_not_available");
  pass("input validation does not wait; terms change waits for Tenant pause");

  // 6. Different Tenants are not globally serialized.
  b = await open();
  await a.run("begin;" + auth + changeTerms(id[5], 2, "stor"));
  await b.run(
    "begin;" +
      auth +
      renew(id[0], 3, "clock_timestamp()+interval '90 days'") +
      "commit;",
  );
  await a.run("commit;");
  pass(
    "terms mutations on different Tenants commit without global serialization",
  );

  assert.equal(
    await observer.run(
      "select bool_and(l.revision=(select count(*) from public.license_audit_events a where a.license_id=l.id) and l.current_terms_version=(select count(*) from public.license_terms_versions t where t.license_id=l.id)) from public.licenses l;",
    ),
    "t",
  );
  await observer.run("begin;" + readHistoryPreflight() + "commit;");
  pass("all committed graphs satisfy exact F2D4 preflight");
  console.log(
    "Local terms concurrency: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  closeAll();
}
