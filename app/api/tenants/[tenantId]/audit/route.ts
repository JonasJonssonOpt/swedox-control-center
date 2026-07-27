import "server-only";

import { listTenantAuditEvents } from "@/lib/server/tenants";
import { createListTenantAuditEventsRoute } from "@/lib/server/tenants/tenant-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createListTenantAuditEventsRoute({
  listTenantAuditEvents,
});
