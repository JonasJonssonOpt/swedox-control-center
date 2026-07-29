import { ControlCenterShell } from "@/components/layout";

export default function InstallationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ControlCenterShell activeModule="installations">
      {children}
    </ControlCenterShell>
  );
}
