import { pathToFileURL } from "node:url";

import {
  executeFixtureOperation,
  parseFixtureInput,
  safeSummary,
} from "./installation-pagination-fixtures.mjs";

export function main(argv = process.argv.slice(2), environment = process.env) {
  try {
    const input = parseFixtureInput(argv, environment);
    const summary = executeFixtureOperation("cleanup", input);
    process.stdout.write(`${safeSummary("cleanup", input, summary)}\n`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fixture cleanup failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
