import { ControlCenterShell } from "@/components/layout";

export default function LicenseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ControlCenterShell activeModule="licenses">{children}</ControlCenterShell>
  );
}
