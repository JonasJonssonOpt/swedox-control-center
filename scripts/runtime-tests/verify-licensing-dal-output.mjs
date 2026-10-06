import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { decodeLicenseListCursor } from "../../lib/server/licenses/license-cursor.ts";
import {
  mapLicenseAuditPage,
  mapLicenseDetail,
  mapLicenseEligibility,
  mapLicenseListPage,
  mapLicenseRow,
  mapLicenseTermsPage,
} from "../../lib/server/licenses/license.mapper.ts";
import { assertLocalTarget, closeAll, open } from "./local-db-harness.mjs";

// F2D7 local output contract: real RPC JSON (json_agg/row_to_json, the same
// serialization PostgREST uses) must pass the strict server mappers, and DTO
// cursors must round-trip into the database unchanged.
// Run: node --import ./tests/register-server-only.mjs <this file> --local
assertLocalTarget(process.argv);

let passed = 0;
function pass(label) {
  passed++;
  console.log("PASS: " + label);
}
const tenants = [0, 1, 2, 3].map(() => randomUUID());
const actor = randomUUID();
const auth =
  "set local role authenticated; select set_config('request.jwt.claim','',true); select set_config('request.jwt.claim.sub','',true); select set_config('request.jwt.claims','" +
  JSON.stringify({ sub: actor, aal: "aal2" }) +
  "',true);";
const sqlText = (value) =>
  value === null ? "null" : "'" + String(value).replaceAll("'", "''") + "'";

try {
  const session = await open();
  async function json(sql) {
    await session.run("begin;" + auth);
    try {
      return JSON.parse(await session.run(sql));
    } finally {
      await session.run("rollback;");
    }
  }
  async function mutate(sql) {
    await session.run("begin;" + auth);
    const value = JSON.parse(await session.run(sql));
    await session.run("commit;");
    return value;
  }
  const rows = (call) =>
    json("select coalesce(json_agg(t),'[]'::json) from " + call + " t;");

  assert.equal(
    await session.run("select count(*) from public.licenses;"),
    "0",
    "fresh reset required",
  );
  await session.run(
    "begin; insert into auth.users(id) values('" +
      actor +
      "'); insert into public.control_center_owner(owner_user_id) values('" +
      actor +
      "');" +
      tenants
        .map(
          (t, index) =>
            "insert into public.tenants(id,category,legal_name,created_by,updated_by) values('" +
            t +
            "','internal','DAL output " +
            index +
            "','" +
            actor +
            "','" +
            actor +
            "');",
        )
        .join("") +
      "commit;",
  );

  // Graphs through the product RPCs; every mutation result passes mapLicenseRow.
  const created = [];
  for (const tenant of tenants.slice(0, 3)) {
    created.push(
      mapLicenseRow(
        await mutate(
          "select row_to_json(l) from public.create_license('" +
            tenant +
            "','mini',null,clock_timestamp()+interval '30 days') l;",
        ),
      ),
    );
  }
  const [a, b, c] = created;
  const activated = mapLicenseRow(
    await mutate(
      "select row_to_json(l) from public.activate_license('" + a.id + "',1) l;",
    ),
  );
  const changed = mapLicenseRow(
    await mutate(
      "select row_to_json(l) from public.change_license_terms('" +
        a.id +
        "',2,'standard') l;",
    ),
  );
  const renewed = mapLicenseRow(
    await mutate(
      "select row_to_json(l) from public.renew_license('" +
        a.id +
        "',3,null) l;",
    ),
  );
  mapLicenseRow(
    await mutate(
      "select row_to_json(l) from public.terminate_license('" +
        c.id +
        "',1) l;",
    ),
  );
  assert.deepEqual(
    [activated.revision, changed.revision, renewed.revision],
    [2, 3, 4],
  );
  assert.equal(renewed.currentTermsVersion, 3);
  pass("all mutation results pass the strict license mapper");

  // List: real timestamps with microseconds; the DTO cursor round-trips.
  const filter = {
    includeTerminated: true,
    search: null,
    status: null,
    tenantId: null,
    validity: null,
  };
  const first = mapLicenseListPage(
    await rows("public.list_licenses(1,p_include_terminated=>true)"),
    filter,
    null,
  );
  assert.equal(first.items.length, 1);
  assert.equal(first.hasMore, true);
  const seen = [first.items[0].id];
  let cursor = first.nextCursor;
  while (cursor !== null) {
    const position = decodeLicenseListCursor(cursor, filter);
    const page = mapLicenseListPage(
      await rows(
        "public.list_licenses(1," +
          sqlText(position.evaluatedAt) +
          "," +
          sqlText(position.createdAt) +
          "," +
          sqlText(position.id) +
          ",p_include_terminated=>true)",
      ),
      filter,
      position.evaluatedAt,
    );
    assert.equal(page.evaluatedAt, position.evaluatedAt);
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  }
  assert.deepEqual(seen, [c.id, b.id, a.id], "created_at DESC without gaps");
  assert.ok(
    first.items.every((item) => /\.\d{1,6}\+00:00$/.test(item.createdAt)),
    "microsecond timestamp text preserved",
  );
  pass("list pages map and the opaque cursor continues the real series");

  const filtered = mapLicenseListPage(
    await rows("public.list_licenses(p_status=>'active',p_validity=>'valid')"),
    {
      ...filter,
      includeTerminated: false,
      status: "active",
      validity: "valid",
    },
    null,
  );
  assert.deepEqual(
    filtered.items.map((item) => [item.id, item.planKey, item.validUntil]),
    [[a.id, "standard", null]],
  );
  pass("filtered list maps exact filters, current terms and Tills vidare");

  const detail = mapLicenseDetail(
    await rows("public.get_license('" + a.id + "')"),
    a.id,
  );
  assert.deepEqual(
    [detail.status, detail.validity, detail.revision, detail.planVersion],
    ["active", "valid", 4, 1],
  );
  pass("detail maps current terms and derived validity");

  const terms1 = mapLicenseTermsPage(
    await rows("public.list_license_terms_versions('" + a.id + "',2)"),
    a.id,
    null,
  );
  const terms2 = mapLicenseTermsPage(
    await rows(
      "public.list_license_terms_versions('" +
        a.id +
        "',2," +
        terms1.nextCursorVersion +
        ")",
    ),
    a.id,
    terms1.nextCursorVersion,
  );
  assert.deepEqual(
    [...terms1.items, ...terms2.items].map((item) => [
      item.version,
      item.planKey,
    ]),
    [
      [3, "standard"],
      [2, "standard"],
      [1, "mini"],
    ],
  );
  pass("terms history maps and paginates by version");

  const audit1 = mapLicenseAuditPage(
    await rows("public.list_license_audit_events('" + a.id + "',3)"),
    a.id,
  );
  const audit2 = mapLicenseAuditPage(
    await rows(
      "public.list_license_audit_events('" +
        a.id +
        "',3," +
        sqlText(audit1.nextCursor.occurredAt) +
        "," +
        sqlText(audit1.nextCursor.id) +
        ")",
    ),
    a.id,
  );
  assert.deepEqual(
    [...audit1.items, ...audit2.items].map((item) => item.eventType),
    [
      "license_renewed",
      "license_terms_changed",
      "license_activated",
      "license_created",
    ],
  );
  assert.ok(audit1.items.every((item) => item.actorUserId === actor));
  pass("audit maps canonical changed_fields and round-trips its cursor");

  const reasons = [];
  for (const tenant of tenants) {
    reasons.push(
      mapLicenseEligibility(
        await rows(
          "public.get_license_provisioning_eligibility('" + tenant + "')",
        ),
      ),
    );
  }
  assert.deepEqual(
    reasons.map((item) => [item.reason, item.licenseId]),
    [
      ["eligible", a.id],
      ["draft", b.id],
      ["terminated", c.id],
      ["missing_license", null],
    ],
  );
  pass("eligibility maps every real reason shape");

  console.log(
    "Local DAL output: " +
      passed +
      "/" +
      passed +
      " passed. REQUIRED NEXT STEP: npm run supabase:reset.",
  );
} finally {
  closeAll();
}
