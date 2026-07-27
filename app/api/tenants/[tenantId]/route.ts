import "server-only";

import { getTenantById } from "@/lib/server/tenants";
import { createGetTenantRoute } from "@/lib/server/tenants/tenant-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createGetTenantRoute({ getTenantById });
