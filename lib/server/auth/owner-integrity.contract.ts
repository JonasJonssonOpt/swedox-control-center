import "server-only";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OWNER_DATABASE_STATUSES = [
  "ok",
  "unauthenticated",
  "missing_database_owner",
  "invalid_database_owner_state",
  "authenticated_user_mismatch",
] as const;

export type OwnerDatabaseStatus = (typeof OWNER_DATABASE_STATUSES)[number];

export type OwnerIntegrityFailureCode =
  | Exclude<OwnerDatabaseStatus, "ok">
  | "missing_environment_owner"
  | "invalid_environment_owner"
  | "owner_mismatch"
  | "integrity_check_unavailable";

export type OwnerIntegrityResult =
  | Readonly<{ ok: true; userId: string }>
  | Readonly<{ code: OwnerIntegrityFailureCode; ok: false }>;

export type OwnerEnvironmentResult =
  | Readonly<{ ok: true; userId: string }>
  | Readonly<{
      code: "invalid_environment_owner" | "missing_environment_owner";
      ok: false;
    }>;

export type OwnerIntegrityDependencies = Readonly<{
  environmentValue: string | undefined;
  getDatabaseStatus: () => Promise<unknown>;
  requireOwner: () => Promise<Readonly<{ userId: string }>>;
}>;

export function getOwnerEnvironment(
  value: string | undefined,
): OwnerEnvironmentResult {
  if (value === undefined) {
    return { code: "missing_environment_owner", ok: false };
  }

  if (
    value.length === 0 ||
    value !== value.trim() ||
    !CANONICAL_UUID_PATTERN.test(value)
  ) {
    return { code: "invalid_environment_owner", ok: false };
  }

  return { ok: true, userId: value.toLowerCase() };
}

export function isOwnerDatabaseStatus(
  value: unknown,
): value is OwnerDatabaseStatus {
  return (
    typeof value === "string" &&
    OWNER_DATABASE_STATUSES.some((status) => status === value)
  );
}

export async function checkOwnerIntegrity(
  dependencies: OwnerIntegrityDependencies,
): Promise<OwnerIntegrityResult> {
  const environment = getOwnerEnvironment(dependencies.environmentValue);

  if (!environment.ok) {
    return environment;
  }

  const owner = await dependencies.requireOwner();

  if (owner.userId.toLowerCase() !== environment.userId) {
    return { code: "owner_mismatch", ok: false };
  }

  let databaseStatus: unknown;

  try {
    databaseStatus = await dependencies.getDatabaseStatus();
  } catch {
    return { code: "integrity_check_unavailable", ok: false };
  }

  if (!isOwnerDatabaseStatus(databaseStatus)) {
    return { code: "integrity_check_unavailable", ok: false };
  }

  if (databaseStatus !== "ok") {
    return { code: databaseStatus, ok: false };
  }

  return Object.freeze({ ok: true, userId: owner.userId });
}

export function createOwnerIntegrityLogEntry(
  code: OwnerIntegrityFailureCode,
  correlationId: string,
  timestamp: string,
): Readonly<{
  code: OwnerIntegrityFailureCode;
  correlationId: string;
  event: "owner_integrity_failed";
  timestamp: string;
}> {
  return Object.freeze({
    code,
    correlationId,
    event: "owner_integrity_failed",
    timestamp,
  });
}
