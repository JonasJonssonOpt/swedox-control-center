import "server-only";

import { getInstallationById } from "@/lib/server/installations";
import { createGetInstallationRoute } from "@/lib/server/installations/installation-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createGetInstallationRoute({ getInstallationById });
