import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const action = process.argv[2];
const supabaseEntryPoint = resolve(
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);

function run(binary, args) {
  return spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
}

function runSupabase(args) {
  return run(process.execPath, [supabaseEntryPoint, ...args]);
}

function fail(message, result) {
  process.stderr.write(`${message}\n`);

  if (result?.error) {
    process.stderr.write(`${result.error.message}\n`);
  }

  process.exit(result?.status || 1);
}

switch (action) {
  case "start": {
    const result = runSupabase([
      "start",
      "--exclude",
      "analytics,vector",
      "--output",
      "json",
    ]);

    if (result.status !== 0) {
      fail("Could not start the local Supabase stack.", result);
    }

    process.stdout.write(
      [
        "Local Supabase stack started.",
        "API: 127.0.0.1:54321",
        "Database: 127.0.0.1:54322",
        "Studio: 127.0.0.1:54323",
        "Mailpit: 127.0.0.1:54324",
      ].join("\n") + "\n",
    );
    break;
  }

  case "status": {
    const result = runSupabase(["status", "--output", "json"]);

    if (result.status !== 0) {
      fail("The local Supabase stack is not healthy.", result);
    }

    process.stdout.write("Local Supabase stack is running.\n");
    break;
  }

  case "stop": {
    const result = runSupabase(["stop"]);

    if (result.status !== 0) {
      fail("Could not stop the local Supabase stack.", result);
    }

    process.stdout.write("Local Supabase stack stopped.\n");
    break;
  }

  default:
    process.stderr.write(
      "Usage: node scripts/supabase-local.mjs <start|status|stop>\n",
    );
    process.exit(2);
}
