import "server-only";

import { listInstallations } from "@/lib/server/installations";
import { createListInstallationsRoute } from "@/lib/server/installations/installation-read-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createListInstallationsRoute({ listInstallations });
