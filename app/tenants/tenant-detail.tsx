import { StatusText } from "@/components/ui/status-text";
import {
  formatOrganizationNumber,
  formatTenantDateTime,
  tenantCategoryLabel,
  tenantStatusLabel,
  valueOrMissing,
} from "@/lib/server/tenants/tenant-presentation";
import type { Tenant } from "@/lib/server/tenants";

import { TenantLifecycleControls } from "./tenant-lifecycle-controls";

type DetailItem = Readonly<{
  label: string;
  value: React.ReactNode;
}>;

function DetailSection({
  items,
  title,
}: Readonly<{ items: readonly DetailItem[]; title: string }>) {
  const sectionId = `section-${title
    .toLocaleLowerCase("sv-SE")
    .replaceAll(" ", "-")}`;

  return (
    <section
      aria-labelledby={sectionId}
      className="rounded-lg border border-stone-200 bg-white"
    >
      <h2
        className="border-b border-stone-200 px-5 py-3 text-sm font-semibold text-stone-950"
        id={sectionId}
      >
        {title}
      </h2>
      <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
              {item.label}
            </dt>
            <dd className="mt-1 text-sm text-stone-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DateValue({ value }: Readonly<{ value: string | null }>) {
  return value === null ? (
    <>Saknas</>
  ) : (
    <time dateTime={value}>{formatTenantDateTime(value)}</time>
  );
}

export function TenantDetail({ tenant }: Readonly<{ tenant: Tenant }>) {
  const isArchived = tenant.archivedAt !== null;

  return (
    <div className="space-y-5">
      {isArchived ? (
        <section
          aria-label="Arkiveringsstatus"
          className="border-l-4 border-stone-600 bg-stone-200 px-4 py-3 text-sm text-stone-900"
        >
          <p className="font-semibold">Denna tenant är arkiverad.</p>
          <p className="mt-1">
            Informationen visas skrivskyddat i den här vyn.
          </p>
        </section>
      ) : null}

      <DetailSection
        items={[
          { label: "Juridiskt namn", value: tenant.legalName },
          {
            label: "Organisationsnummer",
            value: formatOrganizationNumber(tenant.organizationNumber),
          },
          {
            label: "Kategori",
            value: tenantCategoryLabel(tenant.category),
          },
          { label: "Land", value: tenant.countryCode },
        ]}
        title="Identitet"
      />

      <DetailSection
        items={[
          {
            label: "Kontaktperson",
            value: valueOrMissing(tenant.contactName),
          },
          {
            label: "E-post",
            value: valueOrMissing(tenant.contactEmail),
          },
          {
            label: "Telefon",
            value: valueOrMissing(tenant.contactPhone),
          },
        ]}
        title="Kontakt"
      />

      <DetailSection
        items={[
          {
            label: "Operativ status",
            value: (
              <StatusText>
                {tenantStatusLabel(tenant.operationalStatus)}
              </StatusText>
            ),
          },
          {
            label: "Arkiveringsstatus",
            value: (
              <StatusText>
                {isArchived ? "Arkiverad" : "Inte arkiverad"}
              </StatusText>
            ),
          },
          { label: "Revision", value: tenant.revision },
        ]}
        title="Operativ status"
      />

      <TenantLifecycleControls
        archived={isArchived}
        expectedRevision={tenant.revision}
        operationalStatus={tenant.operationalStatus}
        tenantId={tenant.id}
      />

      <section
        aria-labelledby="section-administration"
        className="rounded-lg border border-stone-200 bg-white"
      >
        <h2
          className="border-b border-stone-200 px-5 py-3 text-sm font-semibold text-stone-950"
          id="section-administration"
        >
          Administration
        </h2>
        <p className="whitespace-pre-wrap p-5 text-sm text-stone-900">
          {valueOrMissing(tenant.administrativeNote)}
        </p>
      </section>

      <DetailSection
        items={[
          {
            label: "Skapad",
            value: <DateValue value={tenant.createdAt} />,
          },
          { label: "Skapad av", value: "Verifierad owner" },
          {
            label: "Senast uppdaterad",
            value: <DateValue value={tenant.updatedAt} />,
          },
          { label: "Uppdaterad av", value: "Verifierad owner" },
          {
            label: "Arkiverad",
            value: <DateValue value={tenant.archivedAt} />,
          },
          {
            label: "Arkiverad av",
            value: tenant.archivedBy === null ? "Saknas" : "Verifierad owner",
          },
        ]}
        title="Metadata"
      />
    </div>
  );
}
