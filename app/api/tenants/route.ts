import "server-only";

import { listTenants } from "@/lib/server/tenants";
import { createListTenantsRoute } from "@/lib/server/tenants/tenant-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createListTenantsRoute({ listTenants });
