import "server-only";

import { Buffer } from "node:buffer";

import { LicenseServiceError } from "./license.errors";
import type { LicenseListFilter } from "./license.types";
import {
  isLicenseStatus,
  isLicenseValidity,
  isRecord,
  isTimestamp,
  isUuid,
  normalizeLicenseSearch,
} from "./license.validation";

// Opaque list cursor: last row key, server-issued series time and the full
// normalized filter. Not a secret or an authorization token; the database
// re-validates key and time, and this layer rejects any filter change.
export type LicenseListCursorPosition = Readonly<{
  createdAt: string;
  evaluatedAt: string;
  id: string;
}>;

const VERSION = 1;
const MAX_TOKEN_LENGTH = 2048;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const KEYS = ["c", "e", "f", "i", "v"];
const FILTER_KEYS = ["q", "s", "t", "v", "x"];

function invalid(): never {
  throw new LicenseServiceError("validation_error");
}

function sameKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

export function encodeLicenseListCursor(
  position: LicenseListCursorPosition,
  filter: LicenseListFilter,
): string {
  return Buffer.from(
    JSON.stringify({
      c: position.createdAt,
      e: position.evaluatedAt,
      f: {
        q: filter.search,
        s: filter.status,
        t: filter.tenantId,
        v: filter.validity,
        x: filter.includeTerminated,
      },
      i: position.id,
      v: VERSION,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeLicenseListCursor(
  token: string,
  filter: LicenseListFilter,
): LicenseListCursorPosition {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    !TOKEN_PATTERN.test(token)
  )
    return invalid();
  let value: unknown;
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.toString("base64url") !== token) return invalid();
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    return invalid();
  }
  if (!isRecord(value) || !sameKeys(value, KEYS) || value.v !== VERSION)
    return invalid();
  const bound = value.f;
  if (
    !isTimestamp(value.c) ||
    !isTimestamp(value.e) ||
    !isUuid(value.i) ||
    !isRecord(bound) ||
    !sameKeys(bound, FILTER_KEYS) ||
    (bound.t !== null && !isUuid(bound.t)) ||
    (bound.s !== null && !isLicenseStatus(bound.s)) ||
    (bound.v !== null && !isLicenseValidity(bound.v)) ||
    typeof bound.x !== "boolean" ||
    (bound.q !== null &&
      (typeof bound.q !== "string" ||
        normalizeLicenseSearch(bound.q) !== bound.q))
  )
    return invalid();
  // A cursor continues exactly one series: any filter change starts over.
  if (
    bound.t !== filter.tenantId ||
    bound.s !== filter.status ||
    bound.v !== filter.validity ||
    bound.x !== filter.includeTerminated ||
    bound.q !== filter.search
  )
    return invalid();
  return Object.freeze({
    createdAt: value.c,
    evaluatedAt: value.e,
    id: value.i,
  });
}
