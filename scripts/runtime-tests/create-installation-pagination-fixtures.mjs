import { pathToFileURL } from "node:url";

import {
  executeFixtureOperation,
  parseFixtureInput,
  safeSummary,
} from "./installation-pagination-fixtures.mjs";

export function main(argv = process.argv.slice(2), environment = process.env) {
  try {
    const input = parseFixtureInput(argv, environment);
    const summary = executeFixtureOperation("seed", input);
    process.stdout.write(`${safeSummary("seed", input, summary)}\n`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Fixture seed failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
