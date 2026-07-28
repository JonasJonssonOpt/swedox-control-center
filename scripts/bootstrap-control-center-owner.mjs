import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_RESULTS = new Set([
  "already_bootstrapped",
  "auth_user_not_found",
  "bootstrapped",
  "invalid_database_owner_state",
  "invalid_input",
  "missing_database_owner",
  "ok",
  "owner_mismatch",
]);

export function parseOwnerBootstrapInput(argv, environment) {
  const allowedArguments = new Set(["--confirm-owner-bootstrap", "--verify"]);
  if (argv.some((argument) => !allowedArguments.has(argument))) {
    throw new Error("Unknown bootstrap argument.");
  }

  if (!argv.includes("--confirm-owner-bootstrap")) {
    throw new Error("Explicit bootstrap confirmation is required.");
  }

  const ownerUserId = environment.CONTROL_CENTER_OWNER_USER_ID;
  if (
    typeof ownerUserId !== "string" ||
    ownerUserId.length === 0 ||
    ownerUserId !== ownerUserId.trim() ||
    !UUID_PATTERN.test(ownerUserId)
  ) {
    throw new Error("A valid owner environment value is required.");
  }

  if (environment.CONTROL_CENTER_BOOTSTRAP_TARGET !== "local") {
    throw new Error(
      "The local bootstrap command requires an explicit local target.",
    );
  }

  return Object.freeze({
    mode: argv.includes("--verify") ? "verify" : "bootstrap",
    ownerUserId: ownerUserId.toLowerCase(),
  });
}

function run(binary, args, options = {}) {
  return spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
    windowsHide: true,
    ...options,
  });
}

function expectSuccess(result, safeMessage) {
  if (result.error || result.status !== 0) {
    throw new Error(safeMessage);
  }
  return result.stdout.trim();
}

export function createLocalOwnerBootstrapDependencies(runCommand = run) {
  return Object.freeze({
    findDatabaseContainer() {
      const output = expectSuccess(
        runCommand("docker", [
          "ps",
          "--filter",
          "label=com.supabase.cli.project=swedox-control-center",
          "--filter",
          "name=supabase_db_",
          "--format",
          "{{.Names}}",
        ]),
        "The local database target could not be verified.",
      );
      const containers = output.split(/\r?\n/u).filter(Boolean);
      if (containers.length !== 1) {
        throw new Error("Exactly one local database target is required.");
      }
      return containers[0];
    },
    execute(container, sql) {
      return expectSuccess(
        runCommand(
          "docker",
          [
            "exec",
            "--interactive",
            container,
            "psql",
            "--username",
            "postgres",
            "--dbname",
            "postgres",
            "--no-psqlrc",
            "--set",
            "ON_ERROR_STOP=1",
            "--tuples-only",
            "--no-align",
          ],
          { input: sql },
        ),
        "The owner bootstrap database operation failed.",
      );
    },
  });
}

export function runLocalOwnerBootstrap(input, dependencies) {
  const container = dependencies.findDatabaseContainer();
  const functionName =
    input.mode === "verify"
      ? "private.get_control_center_owner_bootstrap_status"
      : "private.bootstrap_control_center_owner";
  const result = dependencies.execute(
    container,
    `select ${functionName}('${input.ownerUserId}'::uuid);\n`,
  );

  if (!SAFE_RESULTS.has(result)) {
    throw new Error("The owner bootstrap returned an invalid result.");
  }

  if (
    input.mode === "verify"
      ? result !== "ok"
      : !["bootstrapped", "already_bootstrapped"].includes(result)
  ) {
    throw new Error(`Owner bootstrap refused: ${result}.`);
  }

  return result;
}

export function main(argv = process.argv.slice(2), environment = process.env) {
  try {
    const input = parseOwnerBootstrapInput(argv, environment);
    const result = runLocalOwnerBootstrap(
      input,
      createLocalOwnerBootstrapDependencies(),
    );
    process.stdout.write(`Owner bootstrap result: ${result}.\n`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Owner bootstrap failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
