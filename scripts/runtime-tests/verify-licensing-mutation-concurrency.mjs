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
        "VERBOSITY=default",
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
const tenants = [1, 2, 3, 4].map(() => randomUUID());
const actor = randomUUID();
const auth =
  "set local role authenticated; select set_config('request.jwt.claim','',true); select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','" +
  JSON.stringify({ sub: actor, aal: "aal2" }) +
  "',true);";
const create = (n) =>
  "select id from public.create_license('" + tenants[n] + "','mini');";
try {
  const a = await open();
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
            "','internal','Local create concurrency','" +
            actor +
            "','" +
            actor +
            "');",
        )
        .join("") +
      "commit;",
  );
  let b = await open();
  const observer = await open();
  await a.run("begin;" + auth + create(0));
  let pending = observe(b.run("begin;" + auth + create(0) + "commit;"));
  await blocked(observer, b);
  await a.run("commit;");
  failed(await pending, "duplicate_license");
  pass("same Tenant waits then duplicate_license after first commit");
  b = await open();
  await a.run("begin;" + auth + create(1));
  pending = observe(b.run("begin;" + auth + create(1) + "commit;"));
  await blocked(observer, b);
  const beforeRelease = await observer.run("select clock_timestamp()::text;");
  await a.run("rollback;");
  assert.ok(!(await pending).error);
  pass("waiting create succeeds after first rollback");
  assert.equal(
    await observer.run(
      "select created_at >= '" +
        beforeRelease +
        "'::timestamptz from public.licenses where tenant_id='" +
        tenants[1] +
        "';",
    ),
    "t",
  );
  pass("decision time is captured after actual lock wait");
  await a.run("begin;" + auth + create(2));
  await b.run("begin;" + auth + create(3) + "commit;");
  await a.run("commit;");
  pass("different Tenants commit without global serialization");
  assert.equal(
    await observer.run(
      "select count(*)=4 and bool_and(l.status='draft' and l.revision=1 and l.current_terms_version=1 and l.created_at=l.updated_at and l.created_at=a.occurred_at and l.created_at=t.valid_from and l.created_by=a.actor_user_id and l.updated_by=a.actor_user_id and a.revision_after=1 and a.revision_before is null and a.event_type='license_created' and t.version=1 and t.introduced_at_revision=1) from public.licenses l join public.license_audit_events a on a.license_id=l.id join public.license_terms_versions t on t.license_id=l.id;",
    ),
    "t",
  );
  const migration = readFileSync(
    "supabase/migrations/20260913093631_enforce_licensing_history_integrity.sql",
    "utf8",
  );
  const preflight = migration.slice(
    migration.indexOf("lock table"),
    migration.indexOf("create function"),
  );
  await observer.run("begin;" + preflight + "commit;");
  pass("all committed graphs satisfy exact F2D4 preflight");
  console.log(
    "Local mutation concurrency: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  for (const session of sessions) session.close();
}
