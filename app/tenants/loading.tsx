export default function TenantsLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="mx-auto min-h-screen max-w-7xl px-6 py-10 lg:px-8"
    >
      <h1 className="text-2xl font-semibold text-stone-950">Tenants</h1>
      <p className="mt-3 text-sm text-stone-600">Laddar tenantlistan…</p>
    </main>
  );
}
