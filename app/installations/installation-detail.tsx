import { StatusText } from "@/components/ui/status-text";
import {
  formatInstallationDateTime,
  installationEnvironmentLabel,
  installationStatusLabel,
  installationValueOrMissing,
} from "@/lib/server/installations/installation-presentation";
import type { InstallationDetail as InstallationDetailModel } from "@/lib/server/installations";

import { InstallationLifecycleControls } from "./installation-lifecycle-controls";

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

export function InstallationDetail({
  installation,
}: Readonly<{ installation: InstallationDetailModel }>) {
  return (
    <div className="space-y-5">
      {installation.archivedAt !== null ? (
        <section className="rounded-md border border-stone-400 bg-stone-50 px-5 py-4">
          <h2 className="font-semibold text-stone-950">
            Denna installation är arkiverad
          </h2>
          <p className="mt-1 text-sm text-stone-700">
            Den är fortsatt läsbar men visas inte i standardlistan.
          </p>
        </section>
      ) : null}

      <DetailSection title="Identitet">
        <DetailValue label="Display name">
          {installation.displayName}
        </DetailValue>
        <DetailValue label="Installation code">
          {installation.installationCode}
        </DetailValue>
        <DetailValue label="Environment">
          {installationEnvironmentLabel(installation.environment)}
        </DetailValue>
        <DetailValue label="Tenant">{installation.tenantLegalName}</DetailValue>
        <DetailValue label="Administrativ status">
          <StatusText>
            {installationStatusLabel(installation.administrativeStatus)}
          </StatusText>
        </DetailValue>
        <DetailValue label="Arkiveringsstatus">
          <StatusText>
            {installation.archivedAt === null ? "Inte arkiverad" : "Arkiverad"}
          </StatusText>
        </DetailValue>
      </DetailSection>

      <DetailSection title="Teknisk metadata">
        <DetailValue label="Application URL">
          <span className="break-all">
            {installationValueOrMissing(installation.applicationUrl)}
          </span>
        </DetailValue>
        <DetailValue label="Supabase project ref">
          <span className="break-all">
            {installationValueOrMissing(installation.supabaseProjectRef)}
          </span>
        </DetailValue>
        <DetailValue label="Hosting region">
          {installationValueOrMissing(installation.hostingRegion)}
        </DetailValue>
      </DetailSection>

      <DetailSection title="Administration">
        <DetailValue label="Administrativ notering">
          <span className="whitespace-pre-wrap">
            {installationValueOrMissing(installation.administrativeNote)}
          </span>
        </DetailValue>
      </DetailSection>

      <DetailSection title="Metadata">
        <DetailValue label="Revision">{installation.revision}</DetailValue>
        <DetailValue label="Skapad">
          {formatInstallationDateTime(installation.createdAt)}
        </DetailValue>
        <DetailValue label="Senast uppdaterad">
          {formatInstallationDateTime(installation.updatedAt)}
        </DetailValue>
        <DetailValue label="Arkiverad">
          {installation.archivedAt === null
            ? "Saknas"
            : formatInstallationDateTime(installation.archivedAt)}
        </DetailValue>
      </DetailSection>

      <InstallationLifecycleControls
        administrativeStatus={installation.administrativeStatus}
        archived={installation.archivedAt !== null}
        expectedRevision={installation.revision}
        installationId={installation.id}
      />
    </div>
  );
}
