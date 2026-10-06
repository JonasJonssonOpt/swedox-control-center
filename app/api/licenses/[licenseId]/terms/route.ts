import "server-only";

import { listLicenseTermsVersions } from "@/lib/server/licenses";
import { createListLicenseTermsVersionsRoute } from "@/lib/server/licenses/license-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createListLicenseTermsVersionsRoute({
  listLicenseTermsVersions,
});
