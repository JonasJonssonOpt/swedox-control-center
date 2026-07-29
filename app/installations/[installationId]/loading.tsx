export default function InstallationDetailLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-5xl"
    >
      <h1 className="text-2xl font-semibold text-stone-950">
        Installationdetail
      </h1>
      <p className="mt-3 text-sm text-stone-600">Laddar installationsdata…</p>
    </div>
  );
}
