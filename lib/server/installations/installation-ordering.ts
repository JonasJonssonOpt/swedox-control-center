import "server-only";

import { Buffer } from "node:buffer";

export function compareInstallationListKeys(
  left: Readonly<{ displayName: string; id: string }>,
  right: Readonly<{ displayName: string; id: string }>,
): number {
  const displayNameOrder = Buffer.compare(
    Buffer.from(left.displayName, "utf8"),
    Buffer.from(right.displayName, "utf8"),
  );
  if (displayNameOrder !== 0) return displayNameOrder;
  return Buffer.compare(
    Buffer.from(left.id, "ascii"),
    Buffer.from(right.id, "ascii"),
  );
}
