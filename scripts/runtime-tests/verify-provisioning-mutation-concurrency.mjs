import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  assertLocalTarget,
  blocked,
  closeAll,
  failed,
  observe,
  open,
} from "./local-db-harness.mjs";

// F2E5 local concurrency: lock order Installation -> Tenant (KEY SHARE) ->
// run (NO KEY UPDATE) under real parallel transactions, including
// in-flight Installation, Tenant and Licensing mutations.
assertLocalTarget(process.argv);

let passed = 0;
// Statements after the auth prelude print set_config rows first.
const lastLine = (output) => output.split(String.fromCharCode(10)).at(-1);
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}
const actor = randomUUID();
const tenants = [0, 1, 2, 3].map(() => randomUUID());
const installations = [0, 1, 2, 3, 4, 5].map(() => randomUUID());
// Installations 0,1,4,5 belong to tenant 0; 2 to tenant 1; 3 to tenant 2.
const installationTenant = [0, 0, 1, 2, 0, 0];
const licenses = tenants.map(() => randomUUID());
const auth =
  "set local role authenticated; select set_config('request.jwt.claim','',true); select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','" +
  JSON.stringify({ sub: actor, aal: "aal2" }) +
  "',true);";
const runOf = (index) =>
  "(select id from public.provisioning_runs where installation_id='" +
  installations[index] +
  "' order by created_at desc, id desc limit 1)";
const request = (index) =>
  "select status from public.request_provisioning_run('" +
  installations[index] +
  "');";
// API calls run as authenticated, which has no table grants, so run ids are
// resolved by the privileged observer and passed as literals.
let observerSession;
const runId = (index) => observerSession.run(runOf(index).slice(1, -1) + ";");
const start = (id, revision) =>
  "select status from public.start_provisioning_step('" +
  id +
  "'," +
  revision +
  ");";

try {
  const a = await open();
  const observer = await open();
  observerSession = observer;
  assert.equal(
    await a.run("select count(*) from public.provisioning_runs;"),
    "0",
    "fresh reset required",
  );
  assert.equal(
    await a.run("select count(*) from public.control_center_owner;"),
    "0",
    "no existing owner fixture",
  );
  const fixture = ["begin;"];
  fixture.push(
    "insert into auth.users(id) values('" + actor + "');",
    "insert into public.control_center_owner(owner_user_id) values('" +
      actor +
      "');",
  );
  tenants.forEach((tenant, index) => {
    fixture.push(
      "insert into public.tenants(id,category,legal_name,created_by,updated_by) values('" +
        tenant +
        "','internal','Provisioning concurrency " +
        index +
        "','" +
        actor +
        "','" +
        actor +
        "');",
      "insert into public.licenses(id,tenant_id,status,created_at,created_by,updated_at,updated_by) values('" +
        licenses[index] +
        "','" +
        tenant +
        "','active','2021-01-01','" +
        actor +
        "','2021-01-01','" +
        actor +
        "');",
      "insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_after,changed_fields) values('" +
        licenses[index] +
        "','license_created','" +
        actor +
        "','2021-01-01',1,array['id','tenant_id','status','revision']);",
      "insert into public.license_terms_versions values('" +
        licenses[index] +
        "',1,1,'mini',1,'Mini',24,'2021-01-01',null);",
    );
  });
  installations.forEach((installation, index) => {
    fixture.push(
      "insert into public.installations(id,tenant_id,installation_code,display_name,environment,administrative_status,created_by,updated_by) values('" +
        installation +
        "','" +
        tenants[installationTenant[index]] +
        "','concurrency-" +
        index +
        "-" +
        installation.slice(0, 8) +
        "','Concurrency " +
        index +
        "','production','active','" +
        actor +
        "','" +
        actor +
        "');",
    );
  });
  fixture.push("commit;");
  await a.run(fixture.join(""));

  // 1. Parallel requests for one installation: the second waits on the
  //    one-open-run index and gets duplicate_run after the first commits.
  let b = await open();
  await a.run("begin;" + auth + request(0));
  let pending = observe(b.run("begin;" + auth + request(0) + "commit;"));
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "duplicate_run");
  assert.equal(
    await observer.run(
      "select count(*) from public.provisioning_runs where installation_id='" +
        installations[0] +
        "';",
    ),
    "1",
  );
  pass("parallel requests: second waits then duplicate_run, one run exists");

  // 2. First request rolls back: the waiting request succeeds.
  b = await open();
  await a.run("begin;" + auth + request(1));
  pending = observe(b.run("begin;" + auth + request(1) + "commit;"));
  await blocked(observer, b);
  await a.run("rollback;");
  assert.ok(!(await pending).error);
  pass("waiting request succeeds after the first rolls back");

  // 3. Parallel starts with the same revision: the second waits on the run
  //    lock and gets conflict, no second attempt.
  b = await open();
  await a.run("begin;" + auth + start(await runId(0), 1));
  pending = observe(
    b.run("begin;" + auth + start(await runId(0), 1) + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "conflict");
  assert.equal(
    await observer.run(
      "select count(*) from public.provisioning_step_attempts where run_id=" +
        runOf(0) +
        ";",
    ),
    "1",
  );
  pass("parallel starts: second waits then conflict, one attempt");

  // 4. In-flight installation pause holds the installation row: the start
  //    waits and then records installation_not_available.
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.request_provisioning_run('" +
      installations[2] +
      "'); commit;",
  );
  b = await open();
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.pause_installation('" +
      installations[2] +
      "',1);",
  );
  pending = observe(
    b.run("begin;" + auth + start(await runId(2), 1) + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  assert.ok(!(await pending).error, "blocked start is a successful call");
  assert.equal(
    await observer.run(
      "select status||':'||blocked_reason from public.provisioning_runs where id=" +
        runOf(2) +
        ";",
    ),
    "blocked:installation_not_available",
  );
  pass("start waits on in-flight installation pause and records the block");

  // 5. In-flight tenant pause holds the tenant row: the start waits and
  //    then records tenant_not_available.
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.request_provisioning_run('" +
      installations[3] +
      "'); commit;",
  );
  b = await open();
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.pause_tenant('" +
      tenants[2] +
      "',1);",
  );
  pending = observe(
    b.run("begin;" + auth + start(await runId(3), 1) + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  assert.ok(!(await pending).error);
  assert.equal(
    await observer.run(
      "select status||':'||blocked_reason from public.provisioning_runs where id=" +
        runOf(3) +
        ";",
    ),
    "blocked:tenant_not_available",
  );
  pass("start waits on in-flight tenant pause and records the block");

  // 6. In-flight license suspension does not block a start: eligibility is
  //    not a reservation. The next start sees the committed suspension.
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.request_provisioning_run('" +
      installations[4] +
      "'); commit;",
  );
  b = await open();
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.suspend_license('" +
      licenses[0] +
      "',1);",
  );
  assert.equal(
    lastLine(
      await b.run("begin;" + auth + start(await runId(4), 1) + "commit;"),
    ),
    "in_progress",
    "start proceeds without waiting on the license",
  );
  await a.run("commit;");
  await b.run(
    "begin;" +
      auth +
      "select 1 from public.complete_provisioning_step('" +
      (await runId(4)) +
      "',2,'proj4','eu-north-1'); commit;",
  );
  assert.equal(
    lastLine(
      await b.run("begin;" + auth + start(await runId(4), 3) + "commit;"),
    ),
    "blocked",
  );
  assert.equal(
    await observer.run(
      "select blocked_reason from public.provisioning_runs where id=" +
        runOf(4) +
        ";",
    ),
    "license_suspended",
  );
  pass("license suspension is re-checked at the next start, not reserved");

  // 7. Different runs are not serialized.
  b = await open();
  await a.run("begin;" + auth + start(await runId(1), 1));
  assert.equal(
    lastLine(
      await b.run(
        "begin;" +
          auth +
          "select status from public.cancel_provisioning_run('" +
          (await runId(0)) +
          "',2); commit;",
      ),
    ),
    "cancelled",
  );
  await a.run("commit;");
  pass("mutations on different runs commit without global serialization");

  assert.equal(
    await observer.run(
      "select bool_and(r.revision=(select count(*) from public.provisioning_audit_events e where e.run_id=r.id)) from public.provisioning_runs r;",
    ),
    "t",
  );
  pass("every committed run has revision equal to its audit count");
  console.log(
    "Local provisioning concurrency: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  closeAll();
}
