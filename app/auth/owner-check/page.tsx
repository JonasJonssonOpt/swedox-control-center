import { requireFullAccessOwner } from "@/lib/server/auth";

export default async function OwnerCheckPage() {
  await requireFullAccessOwner();

  return (
    <main>
      <p>Owner-behörighet verifierad</p>
    </main>
  );
}
