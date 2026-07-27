import type { ReactNode } from "react";

export function StatusText({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="font-medium text-stone-800">{children}</span>;
}
