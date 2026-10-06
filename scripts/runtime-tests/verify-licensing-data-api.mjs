import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { assertLocalTarget, closeAll, open } from "./local-db-harness.mjs";

// F2D9 local Data API gate with real signed tokens: password sign-in (AAL1),
// real TOTP step-up (AAL2), and direct PostgREST calls without Next.js.
// Local-only: uses the local stack's admin key and demo JWT secret, which
// never exist outside the local Docker stack. Requires a fresh reset and
// `npm run supabase:reset` afterwards.
assertLocalTarget(process.argv);

const status = spawnSync(
  process.execPath,
  [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "env"],
  { encoding: "utf8", windowsHide: true },
);
assert.equal(status.status, 0, "local supabase status");
const env = Object.fromEntries(
  status.stdout
    .split(/\r?\n/)
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const API = env.API_URL;
assert.match(API, /^http:\/\/127\.0\.0\.1:\d+$/, "local API only");
for (const key of ["ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET"]) {
  assert.ok(env[key], key + " available locally");
}

let passed = 0;
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}

async function http(
  path,
  { body, key = env.ANON_KEY, method = "GET", token } = {},
) {
  const response = await fetch(API + path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      apikey: key,
      Authorization: "Bearer " + (token ?? key),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    method,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { json, status: response.status };
}
const admin = (path, options = {}) =>
  http("/auth/v1/admin" + path, {
    ...options,
    key: env.SERVICE_ROLE_KEY,
    token: env.SERVICE_ROLE_KEY,
  });
const rpc = (name, args, token) =>
  http("/rest/v1/rpc/" + name, { body: args, method: "POST", token });
const select = (table, token) =>
  http("/rest/v1/" + table + "?select=*", { token });

function base32Decode(text) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    assert.ok(value >= 0, "base32 secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}
// RFC 6238 TOTP, SHA-1, 6 digits, 30 s: the same code an authenticator shows.
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}
const decode = (token) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
const header = (token) =>
  JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
function sign(claims, secret) {
  const head = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(head + "." + body)
    .digest("base64url");
  return head + "." + body + "." + signature;
}

async function createUser(label) {
  const email = `licensing-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const created = await admin("/users", {
    body: { email, email_confirm: true, password },
    method: "POST",
  });
  assert.equal(created.status, 200, "admin create " + label);
  return { email, id: created.json.id, password };
}
async function signIn(user) {
  const result = await http("/auth/v1/token?grant_type=password", {
    body: { email: user.email, password: user.password },
    method: "POST",
  });
  assert.equal(result.status, 200, "password sign-in");
  return result.json.access_token;
}
async function stepUp(aal1Token) {
  const enrolled = await http("/auth/v1/factors", {
    body: {
      factor_type: "totp",
      friendly_name: "runtime-" + randomUUID().slice(0, 8),
    },
    method: "POST",
    token: aal1Token,
  });
  assert.equal(enrolled.status, 200, "TOTP enroll");
  const factorId = enrolled.json.id;
  const secret = enrolled.json.totp.secret;
  async function verify() {
    const challenge = await http(`/auth/v1/factors/${factorId}/challenge`, {
      body: {},
      method: "POST",
      token: aal1Token,
    });
    assert.equal(challenge.status, 200, "TOTP challenge");
    return http(`/auth/v1/factors/${factorId}/verify`, {
      body: { challenge_id: challenge.json.id, code: totp(secret) },
      method: "POST",
      token: aal1Token,
    });
  }
  let verified = await verify();
  if (verified.status !== 200) {
    // A code generated at a 30 s boundary may be rejected; retry once.
    await new Promise((done) => setTimeout(done, 1500));
    verified = await verify();
  }
  assert.equal(verified.status, 200, "TOTP verify");
  return verified.json.access_token;
}
function deniedAsUnauthorized(result, label) {
  assert.equal(result.status, 400, label + " status");
  assert.equal(result.json?.message, "unauthorized", label + " message");
}
function deniedByPrivilege(result, label) {
  assert.ok(
    [401, 403].includes(result.status),
    label + " status " + result.status,
  );
  assert.equal(result.json?.code, "42501", label + " code");
}
function rejectedToken(result, label) {
  assert.equal(result.status, 401, label + " status");
  assert.ok(!Array.isArray(result.json), label + " no data");
}

try {
  const db = await open();
  assert.equal(
    await db.run("select count(*) from public.licenses;"),
    "0",
    "fresh reset required",
  );
  assert.equal(
    await db.run("select count(*) from public.control_center_owner;"),
    "0",
    "no owner yet",
  );

  // Email login is enabled locally, but self-signup must stay disabled.
  const signup = await http("/auth/v1/signup", {
    body: {
      email: `signup-${randomUUID().slice(0, 8)}@example.test`,
      password: randomBytes(18).toString("base64url"),
    },
    method: "POST",
  });
  assert.equal(signup.status, 422, "self-signup status");
  assert.equal(
    signup.json?.error_code,
    "signup_disabled",
    "self-signup disabled",
  );
  pass("public self-signup is rejected while email login is enabled");

  const owner = await createUser("owner");
  const other = await createUser("other");
  const tenantId = randomUUID();
  await db.run(
    `begin; insert into public.control_center_owner(owner_user_id) values('${owner.id}');` +
      `insert into public.tenants(id,category,legal_name,created_by,updated_by) values('${tenantId}','internal','Data API runtime','${owner.id}','${owner.id}'); commit;`,
  );

  const ownerAal1 = await signIn(owner);
  const ownerAal2 = await stepUp(ownerAal1);
  const otherAal2 = await stepUp(await signIn(other));
  // Real user sessions are asymmetrically signed (no shared secret).
  assert.equal(header(ownerAal2).alg, "ES256");
  assert.equal(header(ownerAal1).alg, "ES256");
  assert.equal(decode(ownerAal1).aal, "aal1");
  assert.equal(decode(ownerAal2).aal, "aal2");
  assert.equal(decode(ownerAal2).sub, owner.id);
  assert.equal(decode(otherAal2).aal, "aal2");
  pass(
    "real password sign-in yields AAL1 and real TOTP step-up yields signed AAL2",
  );

  // Owner AAL2 is the only path that works; reads and writes go through RPC.
  const created = await rpc(
    "create_license",
    { p_plan_key: "mini", p_tenant_id: tenantId },
    ownerAal2,
  );
  assert.equal(created.status, 200, "create via Data API");
  const licenseId = created.json.id;
  assert.equal(
    (
      await rpc(
        "activate_license",
        { p_expected_revision: 1, p_license_id: licenseId },
        ownerAal2,
      )
    ).status,
    200,
  );
  const listed = await rpc("list_licenses", {}, ownerAal2);
  assert.equal(listed.status, 200);
  assert.deepEqual(
    listed.json.map((row) => [row.id, row.status]),
    [[licenseId, "active"]],
  );
  assert.equal(
    (await rpc("get_license", { p_license_id: licenseId }, ownerAal2)).json[0]
      .validity,
    "valid",
  );
  assert.equal(
    (
      await rpc(
        "list_license_terms_versions",
        { p_license_id: licenseId },
        ownerAal2,
      )
    ).json.length,
    1,
  );
  assert.equal(
    (
      await rpc(
        "list_license_audit_events",
        { p_license_id: licenseId },
        ownerAal2,
      )
    ).json.length,
    2,
  );
  assert.equal(
    (
      await rpc(
        "get_license_provisioning_eligibility",
        { p_tenant_id: tenantId },
        ownerAal2,
      )
    ).json[0].reason,
    "eligible",
  );
  assert.equal((await select("licenses", ownerAal2)).json.length, 1);
  assert.equal(
    (await select("license_terms_versions", ownerAal2)).json.length,
    1,
  );
  pass(
    "owner AAL2 reads, mutates and evaluates eligibility through the Data API",
  );

  deniedByPrivilege(
    await select("license_audit_events", ownerAal2),
    "audit table read",
  );
  deniedByPrivilege(
    await http(`/rest/v1/licenses?id=eq.${licenseId}`, {
      body: { status: "draft" },
      method: "PATCH",
      token: ownerAal2,
    }),
    "direct update",
  );
  deniedByPrivilege(
    await http("/rest/v1/licenses", {
      body: { status: "draft", tenant_id: tenantId },
      method: "POST",
      token: ownerAal2,
    }),
    "direct insert",
  );
  deniedByPrivilege(
    await http(`/rest/v1/licenses?id=eq.${licenseId}`, {
      method: "DELETE",
      token: ownerAal2,
    }),
    "direct delete",
  );
  deniedByPrivilege(
    await http("/rest/v1/license_terms_versions", {
      body: { license_id: licenseId, version: 2 },
      method: "POST",
      token: ownerAal2,
    }),
    "direct terms insert",
  );
  pass(
    "even owner AAL2 cannot read audit or write any Licensing table directly",
  );

  const surfaces = [
    ["list_licenses", {}],
    ["get_license", { p_license_id: licenseId }],
    ["list_license_terms_versions", { p_license_id: licenseId }],
    ["list_license_audit_events", { p_license_id: licenseId }],
    ["get_license_provisioning_eligibility", { p_tenant_id: tenantId }],
    ["create_license", { p_plan_key: "mini", p_tenant_id: tenantId }],
    ["activate_license", { p_expected_revision: 2, p_license_id: licenseId }],
    ["suspend_license", { p_expected_revision: 2, p_license_id: licenseId }],
    ["terminate_license", { p_expected_revision: 2, p_license_id: licenseId }],
    [
      "change_license_terms",
      { p_expected_revision: 2, p_license_id: licenseId, p_plan_key: "stor" },
    ],
    [
      "renew_license",
      { p_expected_revision: 2, p_license_id: licenseId, p_valid_until: null },
    ],
  ];
  async function deniedEverywhere(token, label) {
    for (const [name, args] of surfaces) {
      deniedAsUnauthorized(await rpc(name, args, token), `${label} ${name}`);
    }
    assert.deepEqual(
      (await select("licenses", token)).json,
      [],
      label + " licenses rows",
    );
    assert.deepEqual(
      (await select("license_terms_versions", token)).json,
      [],
      label + " terms rows",
    );
    deniedByPrivilege(
      await select("license_audit_events", token),
      label + " audit",
    );
  }
  await deniedEverywhere(ownerAal1, "owner AAL1");
  pass(
    "signed owner AAL1 is denied on all 11 RPCs and sees zero Licensing rows",
  );

  await deniedEverywhere(otherAal2, "non-owner AAL2");
  deniedAsUnauthorized(
    await rpc("get_license", { p_license_id: randomUUID() }, otherAal2),
    "non-owner missing license",
  );
  pass("signed non-owner AAL2 is denied without disclosing existence");

  for (const [name, args] of surfaces) {
    deniedByPrivilege(await rpc(name, args), "anon " + name);
  }
  deniedByPrivilege(await select("licenses"), "anon licenses");
  pass("anon key without user session lacks EXECUTE and SELECT");

  // The pre-step-up token stays AAL1 even after the session reached AAL2.
  await deniedEverywhere(ownerAal1, "stale AAL1 after step-up");
  const metadata = await admin(`/users/${owner.id}`, {
    body: { app_metadata: { aal: "aal2" }, user_metadata: { aal: "aal2" } },
    method: "PUT",
  });
  assert.equal(metadata.status, 200);
  const metadataToken = await signIn(owner);
  assert.equal(decode(metadataToken).aal, "aal1");
  assert.equal(decode(metadataToken).user_metadata.aal, "aal2");
  await deniedEverywhere(metadataToken, "aal2 only in metadata");
  pass("stale AAL1 and aal2 placed in user/app metadata are both denied");

  const parts = ownerAal2.split(".");
  const flipped = parts[2][5] === "A" ? "B" : "A";
  const tampered = [
    parts[0],
    parts[1],
    parts[2].slice(0, 5) + flipped + parts[2].slice(6),
  ].join(".");
  rejectedToken(await rpc("list_licenses", {}, tampered), "tampered signature");
  rejectedToken(
    await select("licenses", tampered),
    "tampered signature select",
  );
  const claims = decode(ownerAal2);
  rejectedToken(
    await rpc(
      "list_licenses",
      {},
      sign(claims, "not-the-local-secret-" + randomUUID()),
    ),
    "wrong secret",
  );
  pass(
    "tampered signature and foreign-secret tokens are rejected before the database",
  );

  const now = Math.floor(Date.now() / 1000);
  const expired = sign(
    { ...claims, exp: now - 60, iat: now - 3660 },
    env.JWT_SECRET,
  );
  const control = sign({ ...claims, exp: now + 300, iat: now }, env.JWT_SECRET);
  rejectedToken(await rpc("list_licenses", {}, expired), "expired token");
  assert.equal(
    (await rpc("list_licenses", {}, control)).status,
    200,
    "control token with valid exp",
  );
  // Note: the local API still accepts the legacy HS256 secret (anon/service
  // keys). Anyone holding it can mint an AAL2 token, so that secret is a
  // high-value server secret in every environment.
  pass(
    "legacy-secret token: expired is rejected while identical claims with a valid exp pass",
  );

  const graph = await db.run(
    `select l.revision||':'||(select count(*) from public.license_audit_events a where a.license_id=l.id)||':'||(select count(*) from public.license_terms_versions t where t.license_id=l.id) from public.licenses l;`,
  );
  assert.equal(graph, "2:2:1", "denied calls changed nothing");
  pass("all denied calls left the license graph unchanged");

  console.log(
    "Local signed Data API: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  closeAll();
}
