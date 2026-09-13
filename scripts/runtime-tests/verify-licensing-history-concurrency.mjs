import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Local-only integration harness. Committed synthetic history is removed by
// the required subsequent local reset, never by disabling history protection.
if (process.argv.length !== 3 || process.argv[2] !== "--local") {
  throw new Error(
    "Requires exactly --local; remote targets are not supported.",
  );
}
const container = "supabase_db_swedox-control-center";
assert.match(
  readFileSync("supabase/config.toml", "utf8"),
  /^project_id = "swedox-control-center"$/m,
);
const dockerContext = execFileSync("docker", ["context", "inspect"], {
  encoding: "utf8",
  windowsHide: true,
});
const endpoint = JSON.parse(dockerContext)[0].Endpoints.docker.Host;
assert.match(
  endpoint,
  /^(npipe:\/\/|unix:\/\/)/,
  "Docker must use a local socket",
);
assert.ok(!process.env.DOCKER_HOST, "DOCKER_HOST override is not supported");

const sessions = [];
class Session {
  constructor() {
    this.output = "";
    this.errors = "";
    this.pending = null;
    this.closed = false;
    this.child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-X",
        "-A",
        "-t",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=sqlstate",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    sessions.push(this);
    this.child.stdout.on("data", (chunk) => {
      this.output += chunk;
      if (this.pending && this.output.includes(this.pending.marker + "\n")) {
        const pending = this.pending;
        this.pending = null;
        clearTimeout(pending.timer);
        pending.resolve(this.output.split(pending.marker)[0].trim());
      }
    });
    this.child.stderr.on("data", (chunk) => {
      this.errors += chunk;
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("close", () => {
      this.closed = true;
      this.fail(new Error(this.errors || "DB session closed"));
    });
  }
  fail(error) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
  }
  run(sql) {
    assert.ok(!this.pending && !this.closed, "Session must be ready");
    this.output = "";
    this.errors = "";
    return new Promise((resolve, reject) => {
      const marker = "done_" + randomUUID().replaceAll("-", "");
      const timer = setTimeout(() => {
        this.fail(new Error("DB harness deadline exceeded"));
        this.child.stdin.end();
        this.child.kill();
      }, 15000);
      this.pending = { resolve, reject, marker, timer };
      this.child.stdin.write(sql + "\n\\echo " + marker + "\n");
    });
  }
  async initialize() {
    this.pid = Number(
      await this.run(
        "set statement_timeout='8s'; set lock_timeout='6s'; set idle_in_transaction_session_timeout='20s'; select pg_backend_pid();",
      ),
    );
    assert.ok(Number.isInteger(this.pid));
    return this;
  }
  close() {
    this.child.stdin.end();
  }
}
const open = () => new Session().initialize();
const ids = [1, 2, 3].map(() => randomUUID());
const tenant = randomUUID();
const actor = randomUUID();
const next = (id, revision) => `
update public.licenses set revision=${revision} where id='${id}';
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields)
values ('${id}','license_activated','${actor}',${revision - 1},${revision},array['revision']);`;
const observe = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
async function blocked(observer, session) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (
      (await observer.run(
        `select cardinality(pg_blocking_pids(${session.pid})) > 0;`,
      )) === "t"
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Expected a real DB lock wait");
}
function failed(result, code) {
  assert.ok(result.error, "Expected transaction rejection");
  assert.match(result.error.message, new RegExp(code));
}
let passed = 0;
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}
try {
  const a = await open();
  assert.equal(
    await a.run("select count(*) from public.licenses;"),
    "0",
    "Run only on a freshly reset local database",
  );
  await a.run(`begin;
insert into public.tenants(id,category,legal_name,created_by,updated_by) values('${tenant}','internal','Local licensing concurrency fixture','${actor}','${actor}');
${ids
  .map(
    (id) => `
insert into public.licenses(id,tenant_id,status,created_by,updated_by) values('${id}','${tenant}','terminated','${actor}','${actor}');
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields) values('${id}','license_created','${actor}',1,array['id']);
insert into public.license_terms_versions values('${id}',1,1,'mini',1,'Mini',24,'2026-01-01',null);`,
  )
  .join("\n")}
commit;`);
  pass("real create commit validates deferred graph");

  let b = await open();
  await a.run(`begin; ${next(ids[0], 2)} set constraints all immediate;`);
  let pending = observe(b.run(`begin; ${next(ids[0], 2)} commit;`));
  await blocked(a, b);
  await a.run("commit;");
  failed(await pending, "23505");
  assert.equal(
    await a.run(`select revision from public.licenses where id='${ids[0]}';`),
    "2",
  );
  pass("competing revision waits then rejects duplicate after commit");

  b = await open();
  await a.run(`begin; ${next(ids[2], 2)} set constraints all immediate;`);
  pending = observe(b.run(`begin; ${next(ids[2], 2)} commit;`));
  await blocked(a, b);
  await a.run("rollback;");
  assert.ok(!(await pending).error);
  assert.equal(
    await a.run(`select revision from public.licenses where id='${ids[2]}';`),
    "2",
  );
  pass("waiting transaction succeeds after competing rollback");

  await a.run(
    `begin; select id from public.licenses where id='${ids[0]}' for key share;`,
  );
  await b.run(`begin; ${next(ids[0], 3)} commit;`);
  await a.run("rollback;");
  pass(
    "validator NO KEY UPDATE is compatible with another session FK KEY SHARE",
  );

  await a.run(
    `begin; select id from public.licenses where id='${ids[0]}' for no key update;`,
  );
  pending = observe(
    b.run(`begin;
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields)
values('${ids[0]}','license_activated','${actor}',3,4,array['revision']);
set constraints all immediate; commit;`),
  );
  await blocked(a, b);
  await a.run("rollback;");
  failed(await pending, "23514");
  assert.equal(
    await a.run(
      `select count(*) from public.license_audit_events where license_id='${ids[0]}';`,
    ),
    "3",
  );
  pass(
    "deferred validator itself waits on parent and rejects standalone future audit",
  );

  b = await open();
  await a.run(
    `begin; select id from public.licenses where id='${ids[0]}' for no key update;`,
  );
  await b.run(`begin; ${next(ids[1], 2)} commit;`);
  await a.run("rollback;");
  pass("independent license commits while other parent remains locked");

  const migration = readFileSync(
    "supabase/migrations/20260913093631_enforce_licensing_history_integrity.sql",
    "utf8",
  );
  const preflight = migration.slice(
    migration.indexOf("lock table"),
    migration.indexOf("create function"),
  );
  await a.run("begin;" + preflight + "commit;");
  pass("exact migration preflight accepts existing valid history");
  const invalid = await open();
  const result = await observe(
    invalid.run(
      `begin; update public.licenses set revision=99 where id='${ids[0]}'; ${preflight} commit;`,
    ),
  );
  failed(result, "23514");
  assert.equal(
    await a.run(`select revision from public.licenses where id='${ids[0]}';`),
    "3",
  );
  pass("exact read-only preflight aborts invalid history without repair");
  console.log(
    `Local concurrency/preflight: ${passed}/${passed} passed. REQUIRED NEXT STEP: npm run supabase:reset.`,
  );
} finally {
  for (const session of sessions) session.close();
}
