"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import type {
  TenantActionField,
  TenantActionResult,
} from "@/lib/server/tenants/tenant-action-core";

import { createTenantAction, updateTenantAction } from "./actions";

export type TenantFormInitialValues = Readonly<{
  administrativeNote: string;
  category: "customer" | "pilot" | "internal";
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  expectedRevision?: number;
  legalName: string;
  organizationNumber: string;
  tenantId?: string;
}>;

type TenantFormProps = Readonly<{
  initialValues: TenantFormInitialValues;
  mode: "create" | "edit";
}>;

const INPUT_CLASS =
  "mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 shadow-sm outline-none transition focus:border-stone-600 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100";

function FieldError({
  field,
  result,
}: Readonly<{
  field: TenantActionField;
  result: TenantActionResult | null;
}>) {
  if (result === null || result.ok) {
    return null;
  }

  const errors = result.fieldErrors?.[field];
  if (!errors?.length) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1" id={`${field}-error`}>
      {errors.map((error) => (
        <p className="text-sm text-red-700" key={error}>
          {error}
        </p>
      ))}
    </div>
  );
}

export function TenantForm({ initialValues, mode }: TenantFormProps) {
  const action = mode === "create" ? createTenantAction : updateTenantAction;
  const [result, formAction, isPending] = useActionState<
    TenantActionResult | null,
    FormData
  >(action, null);
  const [category, setCategory] = useState(initialValues.category);
  const [organizationNumber, setOrganizationNumber] = useState(
    initialValues.organizationNumber,
  );
  const [legalName, setLegalName] = useState(initialValues.legalName);
  const [contactName, setContactName] = useState(initialValues.contactName);
  const [contactEmail, setContactEmail] = useState(initialValues.contactEmail);
  const [contactPhone, setContactPhone] = useState(initialValues.contactPhone);
  const [administrativeNote, setAdministrativeNote] = useState(
    initialValues.administrativeNote,
  );
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && !result.ok) {
      summaryRef.current?.focus();
    }
  }, [result]);

  const hasError = (field: TenantActionField) =>
    result !== null &&
    !result.ok &&
    Boolean(result.fieldErrors?.[field]?.length);
  const cancelHref =
    mode === "edit" && initialValues.tenantId
      ? `/tenants/${initialValues.tenantId}`
      : "/tenants";

  return (
    <form action={formAction} className="space-y-6">
      {result && !result.ok ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-4"
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
        >
          <h2 className="text-sm font-semibold text-red-900">
            Ändringen kunde inte sparas
          </h2>
          <p className="mt-1 text-sm text-red-800">{result.message}</p>
          {result.code === "conflict" ? (
            <p className="mt-2 text-sm text-red-800">
              Posten har ändrats sedan sidan laddades. Gå tillbaka till detail
              och öppna redigeringen igen innan du försöker på nytt.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <>
          <input name="tenantId" type="hidden" value={initialValues.tenantId} />
          <input
            name="expectedRevision"
            type="hidden"
            value={initialValues.expectedRevision}
          />
        </>
      ) : null}

      <section
        aria-labelledby="form-identitet"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="form-identitet"
        >
          Identitet
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="category"
            >
              Kategori
            </label>
            {mode === "create" ? (
              <select
                aria-describedby={
                  hasError("category") ? "category-error" : undefined
                }
                aria-invalid={hasError("category")}
                className={INPUT_CLASS}
                disabled={isPending}
                id="category"
                name="category"
                onChange={(event) =>
                  setCategory(
                    event.target.value as TenantFormInitialValues["category"],
                  )
                }
                required
                value={category}
              >
                <option value="customer">Kund</option>
                <option value="pilot">Pilot</option>
                <option value="internal">Intern</option>
              </select>
            ) : (
              <p className="mt-2 text-sm text-stone-900">
                {category === "customer"
                  ? "Kund"
                  : category === "pilot"
                    ? "Pilot"
                    : "Intern"}{" "}
                <span className="text-stone-500">(kan inte ändras)</span>
              </p>
            )}
            <FieldError field="category" result={result} />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="organizationNumber"
            >
              Organisationsnummer
            </label>
            <input
              aria-describedby={
                hasError("organizationNumber")
                  ? "organizationNumber-help organizationNumber-error"
                  : "organizationNumber-help"
              }
              aria-invalid={hasError("organizationNumber")}
              className={INPUT_CLASS}
              disabled={isPending}
              id="organizationNumber"
              inputMode="numeric"
              maxLength={32}
              name="organizationNumber"
              onChange={(event) => setOrganizationNumber(event.target.value)}
              value={organizationNumber}
            />
            <p
              className="mt-2 text-xs text-stone-500"
              id="organizationNumber-help"
            >
              Obligatoriskt för kund och pilot. Valfritt för intern tenant.
            </p>
            <FieldError field="organizationNumber" result={result} />
          </div>

          <div className="sm:col-span-2">
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="legalName"
            >
              Juridiskt namn
            </label>
            <input
              aria-describedby={
                hasError("legalName") ? "legalName-error" : undefined
              }
              aria-invalid={hasError("legalName")}
              className={INPUT_CLASS}
              disabled={isPending}
              id="legalName"
              maxLength={200}
              name="legalName"
              onChange={(event) => setLegalName(event.target.value)}
              required
              value={legalName}
            />
            <FieldError field="legalName" result={result} />
          </div>

          <div>
            <p className="text-sm font-medium text-stone-800">Land</p>
            <p className="mt-2 text-sm text-stone-900">
              Sverige (SE) <span className="text-stone-500">(låst)</span>
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="form-kontakt"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="form-kontakt"
        >
          Kontakt
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {[
            {
              field: "contactName" as const,
              label: "Kontaktperson",
              maxLength: 120,
              setValue: setContactName,
              value: contactName,
            },
            {
              field: "contactEmail" as const,
              label: "E-post",
              maxLength: 254,
              setValue: setContactEmail,
              type: "email",
              value: contactEmail,
            },
            {
              field: "contactPhone" as const,
              label: "Telefon",
              maxLength: 32,
              setValue: setContactPhone,
              type: "tel",
              value: contactPhone,
            },
          ].map((field) => (
            <div key={field.field}>
              <label
                className="block text-sm font-medium text-stone-800"
                htmlFor={field.field}
              >
                {field.label}
              </label>
              <input
                aria-describedby={
                  hasError(field.field) ? `${field.field}-error` : undefined
                }
                aria-invalid={hasError(field.field)}
                className={INPUT_CLASS}
                disabled={isPending}
                id={field.field}
                maxLength={field.maxLength}
                name={field.field}
                onChange={(event) => field.setValue(event.target.value)}
                type={field.type ?? "text"}
                value={field.value}
              />
              <FieldError field={field.field} result={result} />
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="form-administration"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="form-administration"
        >
          Administration
        </h2>
        <div className="mt-5">
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="administrativeNote"
          >
            Administrativ notering
          </label>
          <textarea
            aria-describedby={
              hasError("administrativeNote")
                ? "administrativeNote-help administrativeNote-error"
                : "administrativeNote-help"
            }
            aria-invalid={hasError("administrativeNote")}
            className={INPUT_CLASS}
            disabled={isPending}
            id="administrativeNote"
            maxLength={1000}
            name="administrativeNote"
            onChange={(event) => setAdministrativeNote(event.target.value)}
            rows={5}
            value={administrativeNote}
          />
          <p
            className="mt-2 text-xs text-stone-500"
            id="administrativeNote-help"
          >
            Intern information. Högst 1 000 tecken.
          </p>
          <FieldError field="administrativeNote" result={result} />
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link
          className="rounded-md px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          href={cancelHref}
        >
          Avbryt
        </Link>
        <button
          aria-disabled={isPending}
          className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Sparar…"
            : mode === "create"
              ? "Skapa tenant"
              : "Spara ändringar"}
        </button>
      </div>
    </form>
  );
}
