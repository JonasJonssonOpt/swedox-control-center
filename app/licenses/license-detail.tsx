import { StatusText } from "@/components/ui/status-text";
import {
  formatLicenseDateTime,
  formatLicenseValidUntil,
  licenseStatusLabel,
  licenseValidityLabel,
} from "@/lib/licenses/license-presentation";
import type { LicenseDetail as LicenseDetailModel } from "@/lib/server/licenses";

import { LicenseLifecycleControls } from "./license-lifecycle-controls";

function DetailSection({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section className="rounded-md border border-stone-300 bg-white">
      <h2 className="border-b border-stone-200 px-5 py-3 text-base font-semibold text-stone-950">
        {title}
      </h2>
      <dl className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

function DetailValue({
  children,
  label,
}: Readonly<{ children: React.ReactNode; label: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-stone-900">{children}</dd>
    </div>
  );
}

function blockingNotice(license: LicenseDetailModel): string | null {
  if (license.status === "terminated")
    return "Licensen är avslutad. Den är läsbar som historik men ger ingen rättighet.";
  if (license.status === "suspended")
    return "Licensen är spärrad och ger ingen rättighet oavsett datum.";
  if (license.status === "draft")
    return "Licensen är ett utkast och ger ingen rättighet förrän den aktiveras.";
  if (license.validity === "expired")
    return "Licensen är aktiv men har gått ut. Förnya den för att återfå giltighet.";
  if (license.validity === "not_started")
    return "Licensen är aktiv men giltighetsperioden har inte börjat.";
  return null;
}

export function LicenseDetail({
  license,
}: Readonly<{ license: LicenseDetailModel }>) {
  const notice = blockingNotice(license);
  return (
    <div className="space-y-5">
      {notice !== null ? (
        <section className="rounded-md border border-stone-400 bg-stone-50 px-5 py-4">
          <p className="text-sm font-medium text-stone-900">{notice}</p>
        </section>
      ) : null}

      <DetailSection title="Licens">
        <DetailValue label="Tenant">{license.tenantLegalName}</DetailValue>
        <DetailValue label="Administrativ status">
          <StatusText>{licenseStatusLabel(license.status)}</StatusText>
        </DetailValue>
        <DetailValue label="Giltighet">
          <StatusText>{licenseValidityLabel(license.validity)}</StatusText>
        </DetailValue>
        <DetailValue label="Giltighet bedömd">
          {formatLicenseDateTime(license.evaluatedAt)}
        </DetailValue>
      </DetailSection>

      <DetailSection title="Aktuella villkor">
        <DetailValue label="Paket">{license.planDisplayLabel}</DetailValue>
        <DetailValue label="Max aktiverade användarkonton">
          {license.maxActiveUsers}
        </DetailValue>
        <DetailValue label="Giltig från">
          {formatLicenseDateTime(license.validFrom)}
        </DetailValue>
        <DetailValue label="Giltig till">
          {formatLicenseValidUntil(license.validUntil)}
        </DetailValue>
        <DetailValue label="Villkorsversion">
          {license.currentTermsVersion}
        </DetailValue>
        <DetailValue label="Kapacitet">
          Gäller hela tenanten och delas av alla installationer. Faktisk
          användning mäts inte här.
        </DetailValue>
      </DetailSection>

      <DetailSection title="Metadata">
        <DetailValue label="Revision">{license.revision}</DetailValue>
        <DetailValue label="Ändrad av">Verifierad owner</DetailValue>
        <DetailValue label="Skapad">
          {formatLicenseDateTime(license.createdAt)}
        </DetailValue>
        <DetailValue label="Senast uppdaterad">
          {formatLicenseDateTime(license.updatedAt)}
        </DetailValue>
      </DetailSection>

      <LicenseLifecycleControls
        expectedRevision={license.revision}
        key={`license-lifecycle-revision-${license.revision}`}
        licenseId={license.id}
        status={license.status}
        validUntil={license.validUntil}
        validity={license.validity}
      />
    </div>
  );
}
