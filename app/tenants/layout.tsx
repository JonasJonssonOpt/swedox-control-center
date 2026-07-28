import { ControlCenterShell } from "@/components/layout";

export default function TenantLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ControlCenterShell activeModule="tenants">{children}</ControlCenterShell>
  );
}
