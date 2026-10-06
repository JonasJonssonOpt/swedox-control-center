import "server-only";

import { listLicenses } from "@/lib/server/licenses";
import { createListLicensesRoute } from "@/lib/server/licenses/license-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createListLicensesRoute({ listLicenses });
