import "server-only";

import { getLicense } from "@/lib/server/licenses";
import { createGetLicenseRoute } from "@/lib/server/licenses/license-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createGetLicenseRoute({ getLicense });
