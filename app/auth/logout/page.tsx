import { requireAuthorizedOwner } from "@/lib/server/auth";

import { logout } from "./actions";

export default async function LogoutPage() {
  await requireAuthorizedOwner();

  return (
    <main>
      <form action={logout}>
        <button type="submit">Logga ut</button>
      </form>
    </main>
  );
}
