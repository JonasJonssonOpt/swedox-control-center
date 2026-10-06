import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Shared local-only multi-session psql harness for Licensing concurrency runners.
// Committed synthetic data is removed by the required subsequent local reset.
const container = "supabase_db_swedox-control-center";

export function assertLocalTarget(argv) {
  if (argv.length !== 3 || argv[2] !== "--local") {
    throw new Error(
      "Requires exactly --local; remote targets are not supported.",
    );
  }
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
}

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
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
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

export const open = () => new Session().initialize();

export const observe = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );

export async function blocked(observer, session) {
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

export function failed(result, code) {
  assert.ok(result.error, "Expected transaction rejection");
  assert.match(result.error.message, new RegExp(code));
}

export function closeAll() {
  for (const session of sessions) session.close();
}

export function readHistoryPreflight() {
  const migration = readFileSync(
    "supabase/migrations/20260913093631_enforce_licensing_history_integrity.sql",
    "utf8",
  );
  return migration.slice(
    migration.indexOf("lock table"),
    migration.indexOf("create function"),
  );
}
