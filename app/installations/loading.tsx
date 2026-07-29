export default function InstallationsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <h1 className="text-2xl font-semibold text-stone-950">Installationer</h1>
      <p className="mt-3 text-sm text-stone-600">Laddar installationslistan…</p>
    </div>
  );
}
