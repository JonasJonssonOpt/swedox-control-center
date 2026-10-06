import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { recordMfaAuditEvent } from "../lib/server/audit/mfa-audit.ts";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function captureInfo(callback) {
  const original = console.info;
  const lines = [];
  console.info = (line) => lines.push(line);
  try {
    callback();
  } finally {
    console.info = original;
  }
  return lines;
}

test("MFA audit log contains only category, result, time and correlation ID", () => {
  const [line] = captureInfo(() => recordMfaAuditEvent("challenge_failed"));
  const entry = JSON.parse(line);
  assert.deepEqual(Object.keys(entry).sort(), [
    "correlationId",
    "event",
    "result",
    "timestamp",
  ]);
  assert.equal(entry.event, "challenge_failed");
  assert.equal(entry.result, "failure");
  assert.ok(Number.isFinite(Date.parse(entry.timestamp)));
  assert.deepEqual(line.match(UUID_PATTERN), [entry.correlationId]);
});

test("each MFA audit entry gets a fresh correlation ID", () => {
  const lines = captureInfo(() => {
    recordMfaAuditEvent("logout_completed");
    recordMfaAuditEvent("logout_completed");
  });
  const [first, second] = lines.map((line) => JSON.parse(line).correlationId);
  assert.notEqual(first, second);
});

test("MFA audit callers never pass an identity", async () => {
  const sources = await Promise.all(
    [
      "../lib/server/audit/mfa-audit.ts",
      "../lib/server/auth/get-owner-mfa-state.ts",
      "../app/auth/logout/actions.ts",
      "../app/auth/mfa/challenge/actions.ts",
      "../app/auth/mfa/enroll/actions.ts",
      "../app/auth/mfa/enroll/enrollment-server.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /(?:recordMfaAuditEvent|auditedMfaFailure)\([^)]*,\s*[^\s)]/,
    );
  }
  assert.doesNotMatch(sources[0], /userId/);
});
