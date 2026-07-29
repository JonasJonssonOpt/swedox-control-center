import "server-only";

import { listInstallationAuditEvents } from "@/lib/server/installations";
import { createListInstallationAuditEventsRoute } from "@/lib/server/installations/installation-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createListInstallationAuditEventsRoute({
  listInstallationAuditEvents,
});
