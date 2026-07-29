import Link from "next/link";

export default function InstallationNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl py-6">
      <h1 className="text-2xl font-semibold text-stone-950">
        Installationen kunde inte hittas
      </h1>
      <p className="mt-3 text-sm text-stone-600">
        Kontrollera länken eller gå tillbaka till installationslistan.
      </p>
      <Link
        className="mt-6 inline-block rounded-sm text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        href="/installations"
      >
        Till installationslistan
      </Link>
    </div>
  );
}
