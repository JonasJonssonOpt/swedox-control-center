import Link from "next/link";

const MODULES = [
  { label: "Dashboard" },
  { href: "/tenants", id: "tenants", label: "Tenants" },
  {
    href: "/installations",
    id: "installations",
    label: "Installations",
  },
  { label: "Licenses" },
  { label: "Provisioning" },
  { label: "Monitoring" },
  { label: "Settings" },
] as const;

export function ControlCenterShell({
  activeModule,
  children,
}: Readonly<{
  activeModule: "installations" | "tenants";
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-stone-100 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-stone-300 bg-stone-950 px-4 py-6 text-stone-100 md:min-h-screen md:border-r md:border-b-0">
        <p className="px-3 text-sm font-semibold tracking-wide">SweDox</p>
        <nav aria-label="Huvudnavigation" className="mt-8">
          <ul className="space-y-1">
            {MODULES.map((module) => (
              <li key={module.label}>
                {"href" in module ? (
                  <Link
                    aria-current={
                      module.id === activeModule ? "page" : undefined
                    }
                    className="block rounded-sm px-3 py-2 text-sm font-semibold text-white underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    href={module.href}
                  >
                    {module.label}
                  </Link>
                ) : (
                  <div className="px-3 py-2">
                    <span className="block text-sm text-stone-300">
                      {module.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-400">
                      Kommer senare
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-6 border-b border-stone-300 bg-white px-6 py-3 lg:px-8">
          <p className="text-sm font-semibold text-stone-950">Control Center</p>
          <p className="text-sm text-stone-600">Verifierad owner</p>
        </header>
        <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
