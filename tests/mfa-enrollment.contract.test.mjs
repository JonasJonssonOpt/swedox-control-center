import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  performMfaEnrollmentStart,
  performMfaEnrollmentVerification,
} from "../app/auth/mfa/enroll/mfa-enrollment-core.ts";

const FACTOR_ID = "00000000-0000-4000-8000-000000000401";
const QR_CODE = "data:image/svg+xml;utf-8,%3Csvg%3Eqr%3C/svg%3E";
const SECRET = "SYNTHETICSECRET";

function factor(status = "unverified") {
  return {
    created_at: "2026-07-28T12:00:00.000Z",
    factor_type: "totp",
    friendly_name: "swedox-control-center-owner-totp",
    id: FACTOR_ID,
    status,
    updated_at: "2026-07-28T12:00:00.000Z",
  };
}

function client(overrides = {}) {
  const calls = [];
  const mfa = {
    challenge: async (input) => {
      calls.push(["challenge", input]);
      return { data: { id: "challenge-id" }, error: null };
    },
    enroll: async (input) => {
      calls.push(["enroll", input]);
      return {
        data: {
          id: FACTOR_ID,
          totp: { qr_code: QR_CODE, secret: SECRET, uri: "not-rendered" },
          type: "totp",
        },
        error: null,
      };
    },
    getAuthenticatorAssuranceLevel: async () => {
      calls.push(["assurance"]);
      return {
        data: { currentLevel: "aal2", nextLevel: "aal2" },
        error: null,
      };
    },
    listFactors: async () => {
      calls.push(["listFactors"]);
      return {
        data: { all: [], phone: [], totp: [], webauthn: [] },
        error: null,
      };
    },
    unenroll: async (input) => {
      calls.push(["unenroll", input]);
      return { data: {}, error: null };
    },
    verify: async (input) => {
      calls.push(["verify", input]);
      return { data: {}, error: null };
    },
    ...overrides,
  };
  return { calls, supabase: { auth: { mfa } } };
}

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("enrollment creates one TOTP factor and preserves Supabase QR and secret", async () => {
  const { calls, supabase } = client();
  const result = await performMfaEnrollmentStart(supabase);
  assert.deepEqual(result, {
    data: {
      factorId: FACTOR_ID,
      qrCode: QR_CODE,
      secret: SECRET,
      status: "ready",
    },
    status: "success",
  });
  assert.deepEqual(calls.at(-1), [
    "enroll",
    {
      factorType: "totp",
      friendlyName: "swedox-control-center-owner-totp",
    },
  ]);
});

test("refresh removes one unverified factor before creating a replacement", async () => {
  const { calls, supabase } = client();
  assert.equal(
    (await performMfaEnrollmentStart(supabase, FACTOR_ID)).status,
    "success",
  );
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ["unenroll", "listFactors", "enroll"],
  );
  assert.deepEqual(calls[0][1], { factorId: FACTOR_ID });
});

test("a legacy name conflict retries enrollment and reaches QR creation", async () => {
  let enrollmentCalls = 0;
  const { calls, supabase } = client({
    enroll: async (input) => {
      calls.push(["enroll", input]);
      enrollmentCalls += 1;
      if (enrollmentCalls === 1) {
        return {
          data: null,
          error: { code: "mfa_factor_name_conflict" },
        };
      }
      return {
        data: {
          id: FACTOR_ID,
          totp: { qr_code: QR_CODE, secret: SECRET, uri: "not-rendered" },
          type: "totp",
        },
        error: null,
      };
    },
  });

  assert.equal((await performMfaEnrollmentStart(supabase)).status, "success");
  assert.equal(enrollmentCalls, 2);
  assert.match(
    calls.at(-1)[1].friendlyName,
    /^swedox-control-center-owner-totp-[0-9a-f-]{36}$/,
  );
});

test("verified, unsupported, conflict and malformed enrollment states fail closed", async () => {
  const cases = [
    client({
      listFactors: async () => ({
        data: {
          all: [factor("verified")],
          phone: [],
          totp: [factor("verified")],
          webauthn: [],
        },
        error: null,
      }),
    }).supabase,
    client({
      listFactors: async () => ({
        data: {
          all: [{ ...factor(), factor_type: "phone" }],
          phone: [],
          totp: [],
          webauthn: [],
        },
        error: null,
      }),
    }).supabase,
    client({
      enroll: async () => ({
        data: null,
        error: { code: "mfa_factor_name_conflict" },
      }),
    }).supabase,
    client({
      enroll: async () => ({
        data: {
          id: FACTOR_ID,
          totp: { qr_code: "invalid", secret: "", uri: "" },
          type: "totp",
        },
        error: null,
      }),
    }).supabase,
  ];

  assert.equal(
    (await performMfaEnrollmentStart(cases[0])).status,
    "security_error",
  );
  assert.equal(
    (await performMfaEnrollmentStart(cases[1])).status,
    "security_error",
  );
  assert.equal(
    (await performMfaEnrollmentStart(cases[2])).status,
    "enrollment_in_progress",
  );
  assert.equal(
    (await performMfaEnrollmentStart(cases[3])).status,
    "security_error",
  );
});

test("verification challenges the sole factor, verifies code and requires AAL2", async () => {
  const { calls, supabase } = client({
    listFactors: async () => ({
      data: { all: [factor()], phone: [], totp: [], webauthn: [] },
      error: null,
    }),
  });
  assert.deepEqual(
    await performMfaEnrollmentVerification(supabase, FACTOR_ID, "123456"),
    { status: "success" },
  );
  assert.deepEqual(calls, [
    ["challenge", { factorId: FACTOR_ID }],
    [
      "verify",
      {
        challengeId: "challenge-id",
        code: "123456",
        factorId: FACTOR_ID,
      },
    ],
    ["assurance"],
  ]);
});

test("challenge, verify and missing AAL2 failures never become success", async () => {
  const factors = async () => ({
    data: { all: [factor()], phone: [], totp: [], webauthn: [] },
    error: null,
  });
  const cases = [
    client({
      challenge: async () => ({ data: null, error: { code: "expired" } }),
      listFactors: factors,
    }).supabase,
    client({
      listFactors: factors,
      verify: async () => ({ data: null, error: { code: "invalid" } }),
    }).supabase,
    client({
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: "aal1", nextLevel: "aal2" },
        error: null,
      }),
      listFactors: factors,
    }).supabase,
  ];
  assert.equal(
    (await performMfaEnrollmentVerification(cases[0], FACTOR_ID, "123456"))
      .status,
    "verification_failed",
  );
  assert.equal(
    (await performMfaEnrollmentVerification(cases[1], FACTOR_ID, "123456"))
      .status,
    "verification_failed",
  );
  assert.equal(
    (await performMfaEnrollmentVerification(cases[2], FACTOR_ID, "123456"))
      .status,
    "security_error",
  );
});

test("route always renders an explicit state and exposes no redirect input or raw errors", async () => {
  const [page, form, actions, loading] = await Promise.all([
    source("../app/auth/mfa/enroll/page.tsx"),
    source("../app/auth/mfa/enroll/enrollment-form.tsx"),
    source("../app/auth/mfa/enroll/actions.ts"),
    source("../app/auth/mfa/enroll/loading.tsx"),
  ]);
  assert.match(page, /INITIAL_ENROLLMENT_STATE/);
  assert.match(page, /Konfigurera Microsoft Authenticator/);
  assert.match(form, /state\.status === "ready"/);
  assert.match(form, /state\.status === "loading"/);
  assert.match(form, /startTransition\(\(\) => action\(new FormData\(\)\)\)/);
  assert.doesNotMatch(form, /from "next\/image"/);
  assert.match(form, /<img/);
  assert.match(form, /alt="QR-kod för Microsoft Authenticator"/);
  assert.match(form, /src=\{state\.qrCode\}/);
  assert.match(form, /state\.secret/);
  assert.match(form, /<VerificationForm \/>/);
  assert.match(form, /inputMode="numeric"/);
  assert.match(form, /autoComplete="one-time-code"/);
  assert.match(form, /aria-invalid/);
  assert.match(form, /role="alert"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(actions, /redirect\("\/tenants"\)/);
  assert.doesNotMatch(
    `${page}\n${form}\n${actions}`,
    /searchParams|returnTo|redirectTo|service.role|console\.(?:log|error)|dangerouslySetInnerHTML/i,
  );
});
