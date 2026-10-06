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

// F2E7 local recovery races: late outcomes against cancellation and against
// each other serialize on the run lock and never produce two outcomes.
assertLocalTarget(process.argv);

let passed = 0;
// Statements after the auth prelude print set_config rows first.
const lastLine = (output) => output.split(String.fromCharCode(10)).at(-1);
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}
const actor = randomUUID();
const tenant = randomUUID();
const license = randomUUID();
const installations = [0, 1, 2].map(() => randomUUID());
const auth =
  "set local role authenticated; select set_config('request.jwt.claim','',true); select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','" +
  JSON.stringify({ sub: actor, aal: "aal2" }) +
  "',true);";

try {
  const a = await open();
  const observer = await open();
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
  await a.run(
    [
      "begin;",
      "insert into auth.users(id) values('" + actor + "');",
      "insert into public.control_center_owner(owner_user_id) values('" +
        actor +
        "');",
      "insert into public.tenants(id,category,legal_name,created_by,updated_by) values('" +
        tenant +
        "','internal','Recovery races','" +
        actor +
        "','" +
        actor +
        "');",
      "insert into public.licenses(id,tenant_id,status,created_at,created_by,updated_at,updated_by) values('" +
        license +
        "','" +
        tenant +
        "','active','2021-01-01','" +
        actor +
        "','2021-01-01','" +
        actor +
        "');",
      "insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_after,changed_fields) values('" +
        license +
        "','license_created','" +
        actor +
        "','2021-01-01',1,array['id','tenant_id','status','revision']);",
      "insert into public.license_terms_versions values('" +
        license +
        "',1,1,'mini',1,'Mini',24,'2021-01-01',null);",
      ...installations.map(
        (installation, index) =>
          "insert into public.installations(id,tenant_id,installation_code,display_name,environment,created_by,updated_by) values('" +
          installation +
          "','" +
          tenant +
          "','recovery-race-" +
          index +
          "-" +
          installation.slice(0, 8) +
          "','Recovery race " +
          index +
          "','production','" +
          actor +
          "','" +
          actor +
          "');",
      ),
      "commit;",
    ].join(""),
  );
  // Each run gets an open first-step attempt at revision 2.
  const runs = [];
  for (const installation of installations) {
    await a.run(
      "begin;" +
        auth +
        "select 1 from public.request_provisioning_run('" +
        installation +
        "'); commit;",
    );
    const id = await observer.run(
      "select id from public.provisioning_runs where installation_id='" +
        installation +
        "';",
    );
    await a.run(
      "begin;" +
        auth +
        "select 1 from public.start_provisioning_step('" +
        id +
        "',1); commit;",
    );
    runs.push(id);
  }
  const outcome = (id) =>
    observer.run(
      "select r.status||':'||r.revision||':'||(select string_agg(coalesce(outcome,'open'),',' order by attempt_number) from public.provisioning_step_attempts where run_id=r.id) from public.provisioning_runs r where r.id='" +
        id +
        "';",
    );
  const complete = (id, revision) =>
    "select status from public.complete_provisioning_step('" +
    id +
    "'," +
    revision +
    ",'projrace','eu-north-1');";

  // 1. A cancellation in flight: the late completion with the same revision
  //    waits and gets conflict. The attempt stays cancelled.
  let b = await open();
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.cancel_provisioning_run('" +
      runs[0] +
      "',2);",
  );
  let pending = observe(
    b.run("begin;" + auth + complete(runs[0], 2) + "commit;"),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "conflict");
  assert.equal(await outcome(runs[0]), "cancelled:3:cancelled");
  pass("late completion racing a cancellation gets conflict, one outcome");

  // 2. After the cancellation, even a fresh revision cannot complete.
  b = await open();
  failed(
    await observe(b.run("begin;" + auth + complete(runs[0], 3) + "commit;")),
    "invalid_state_transition",
  );
  pass("completion after cancellation is an invalid transition");

  // 3. Completion and failure race on one attempt: exactly one outcome.
  b = await open();
  await a.run("begin;" + auth + complete(runs[1], 2));
  pending = observe(
    b.run(
      "begin;" +
        auth +
        "select status from public.fail_provisioning_step('" +
        runs[1] +
        "',2,'timeout'); commit;",
    ),
  );
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "conflict");
  assert.equal(await outcome(runs[1]), "in_progress:3:succeeded");
  pass("completion and failure racing: first wins, second gets conflict");

  // 4. Reads, including the stale-only list, never wait on a held run lock.
  await a.run(
    "begin;" +
      auth +
      "select 1 from public.fail_provisioning_step('" +
      runs[2] +
      "',2,'other');",
  );
  b = await open();
  assert.equal(
    lastLine(
      await b.run(
        "begin;" +
          auth +
          "select status from public.get_provisioning_run('" +
          runs[2] +
          "') limit 1; rollback;",
      ),
    ),
    "in_progress",
    "detail reads the committed state without waiting",
  );
  assert.equal(
    lastLine(
      await b.run(
        "begin;" +
          auth +
          "select count(*) from public.list_provisioning_runs(p_only_stale=>true); rollback;",
      ),
    ),
    "0",
  );
  await a.run("commit;");
  assert.equal(await outcome(runs[2]), "failed:3:failed");
  pass("reads do not wait on an in-flight outcome");

  assert.equal(
    await observer.run(
      "select bool_and(r.revision=(select count(*) from public.provisioning_audit_events e where e.run_id=r.id)) from public.provisioning_runs r;",
    ),
    "t",
  );
  pass("every committed run has revision equal to its audit count");
  console.log(
    "Local provisioning recovery: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  closeAll();
}
