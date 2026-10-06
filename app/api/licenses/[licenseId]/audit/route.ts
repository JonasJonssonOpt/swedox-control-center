import "server-only";

import { listLicenseAuditEvents } from "@/lib/server/licenses";
import { createListLicenseAuditEventsRoute } from "@/lib/server/licenses/license-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createListLicenseAuditEventsRoute({
  listLicenseAuditEvents,
});
