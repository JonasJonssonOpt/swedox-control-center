import { spawnSync } from "node:child_process";

export const FIXTURE_COUNT = 55;
export const FIXTURE_CODE_PREFIX = "pagination-fixture-";
export const FIXTURE_DISPLAY_PREFIX = "Pagination Fixture ";
export const FIXTURE_ENVIRONMENT = "test";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROJECT_REF_PATTERN = /^[a-z0-9]{1,64}$/u;

export function fixtureRows() {
  return Object.freeze(
    Array.from({ length: FIXTURE_COUNT }, (_, index) => {
      const suffix = String(index + 1).padStart(3, "0");
      return Object.freeze({
        code: `${FIXTURE_CODE_PREFIX}${suffix}`,
        displayName: `${FIXTURE_DISPLAY_PREFIX}${suffix}`,
      });
    }),
  );
}

export function parseFixtureInput(argv, environment) {
  const allowedArguments = new Set(["--dry-run"]);
  if (argv.some((argument) => !allowedArguments.has(argument))) {
    throw new Error("Unknown runtime fixture argument.");
  }
  if (environment.CONTROL_CENTER_RUNTIME_TEST_TARGET !== "cloud-test") {
    throw new Error("Explicit cloud-test target is required.");
  }
  if (environment.CONTROL_CENTER_RUNTIME_TEST_CONFIRM !== "YES") {
    throw new Error("Explicit runtime fixture confirmation is required.");
  }
  const tenantId = environment.CONTROL_CENTER_RUNTIME_TEST_TENANT_ID;
  if (typeof tenantId !== "string" || !UUID_PATTERN.test(tenantId)) {
    throw new Error("A valid explicit test tenant UUID is required.");
  }
  const projectRef = environment.CONTROL_CENTER_RUNTIME_TEST_PROJECT_REF;
  if (typeof projectRef !== "string" || !PROJECT_REF_PATTERN.test(projectRef)) {
    throw new Error("A valid expected project reference is required.");
  }
  const targetSignals = [environment.PGHOST, environment.PGUSER].filter(
    (value) => typeof value === "string",
  );
  if (!targetSignals.some((value) => value.includes(projectRef))) {
    throw new Error("The PG target does not match the expected project.");
  }
  return Object.freeze({
    dryRun: argv.includes("--dry-run"),
    tenantId: tenantId.toLowerCase(),
  });
}

function valuesSql() {
  return fixtureRows()
    .map(
      ({ code, displayName }) =>
        `('${code.replaceAll("'", "''")}', '${displayName.replaceAll("'", "''")}')`,
    )
    .join(",\n");
}

function preamble(tenantId) {
  return `
begin;
create temporary table runtime_installation_pagination_fixtures (
  installation_code text primary key,
  display_name text not null
) on commit drop;
insert into runtime_installation_pagination_fixtures values
${valuesSql()};

do $fixture_guard$
begin
  if not exists (
    select 1 from public.tenants
    where id = '${tenantId}'::uuid
      and category = 'internal'
      and operational_status = 'active'
      and archived_at is null
  ) then
    raise exception 'fixture_tenant_not_available';
  end if;
  if (select count(*) from public.control_center_owner) <> 1 then
    raise exception 'fixture_owner_invalid';
  end if;
  if exists (
    select 1
    from public.installations installation
    join runtime_installation_pagination_fixtures fixture
      on fixture.installation_code = installation.installation_code
    where installation.tenant_id <> '${tenantId}'::uuid
      or installation.display_name <> fixture.display_name
      or installation.environment <> '${FIXTURE_ENVIRONMENT}'
      or installation.administrative_status <> 'planned'
      or installation.application_url is not null
      or installation.supabase_project_ref is not null
      or installation.hosting_region is not null
      or installation.administrative_note is not null
      or installation.revision <> 1
      or installation.archived_at is not null
  ) then
    raise exception 'fixture_collision_or_drift';
  end if;
end
$fixture_guard$;
`;
}

export function seedSql(input) {
  const write = input.dryRun
    ? ""
    : `insert into public.installations (
        tenant_id, installation_code, display_name, environment,
        administrative_status, application_url, supabase_project_ref,
        hosting_region, administrative_note, revision,
        created_by, updated_by
      )
      select
        '${input.tenantId}'::uuid, fixture.installation_code,
        fixture.display_name, '${FIXTURE_ENVIRONMENT}', 'planned',
        null, null, null, null, 1, owner.owner_user_id, owner.owner_user_id
      from runtime_installation_pagination_fixtures fixture
      cross join public.control_center_owner owner
      where not exists (
        select 1 from public.installations installation
        where installation.installation_code = fixture.installation_code
      );`;
  return `${preamble(input.tenantId)}
create temporary table runtime_fixture_seed_plan on commit drop as
select
  count(installation.id)::integer as existing_count,
  (${FIXTURE_COUNT} - count(installation.id))::integer as creating_count
from runtime_installation_pagination_fixtures fixture
left join public.installations installation
  on installation.installation_code = fixture.installation_code;
${write}
select
  existing_count::text || '|' || creating_count::text || '|${FIXTURE_COUNT}'
from runtime_fixture_seed_plan;
${input.dryRun ? "rollback;" : "commit;"}
`;
}

export function cleanupSql(input) {
  const write = input.dryRun
    ? ""
    : `delete from public.installations installation
      using runtime_installation_pagination_fixtures fixture
      where installation.installation_code = fixture.installation_code
        and installation.tenant_id = '${input.tenantId}'::uuid;`;
  return `${preamble(input.tenantId)}
do $cleanup_guard$
begin
  if exists (
    select 1
    from public.installations installation
    join runtime_installation_pagination_fixtures fixture
      on fixture.installation_code = installation.installation_code
    join public.installation_audit_events audit
      on audit.installation_id = installation.id
  ) then
    raise exception 'fixture_has_audit_and_must_not_be_deleted';
  end if;
end
$cleanup_guard$;
select count(*)::text || '|${FIXTURE_COUNT}'
from public.installations installation
join runtime_installation_pagination_fixtures fixture
  on fixture.installation_code = installation.installation_code
where installation.tenant_id = '${input.tenantId}'::uuid;
${write}
${input.dryRun ? "rollback;" : "commit;"}
`;
}

function runPsql(sql) {
  return spawnSync(
    "psql",
    [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--quiet",
    ],
    {
      encoding: "utf8",
      input: sql,
      maxBuffer: 1024 * 1024,
      shell: false,
      windowsHide: true,
    },
  );
}

export function executeFixtureOperation(kind, input, runCommand = runPsql) {
  const result = runCommand(
    kind === "seed" ? seedSql(input) : cleanupSql(input),
  );
  if (result.error || result.status !== 0) {
    throw new Error("The runtime fixture database operation failed safely.");
  }
  const summary = result.stdout.trim().split("|").map(Number);
  if (summary.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(
      "The runtime fixture operation returned an invalid result.",
    );
  }
  return Object.freeze(summary);
}

export function safeSummary(kind, input, summary) {
  if (kind === "seed") {
    const [existing, creating, target] = summary;
    return [
      `Target: cloud-test (${input.dryRun ? "dry-run" : "write"}).`,
      `Tenant: explicit internal test tenant (masked).`,
      `Fixture prefix: ${FIXTURE_CODE_PREFIX}`,
      `Existing fixtures: ${existing}.`,
      `${input.dryRun ? "Would create" : "Created"}: ${creating}.`,
      `Target count: ${target}.`,
    ].join("\n");
  }
  const [matching, target] = summary;
  return [
    `Target: cloud-test (${input.dryRun ? "dry-run" : "write"}).`,
    `Tenant: explicit internal test tenant (masked).`,
    `Fixture prefix: ${FIXTURE_CODE_PREFIX}`,
    `${input.dryRun ? "Would clean" : "Matched before cleanup"}: ${matching}.`,
    `Fixture set size: ${target}.`,
  ].join("\n");
}
