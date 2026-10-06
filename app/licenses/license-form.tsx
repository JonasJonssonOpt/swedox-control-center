"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { StatusText } from "@/components/ui/status-text";
import {
  formatLicenseDateTime,
  formatLicenseValidUntil,
  LICENSE_PLAN_OPTIONS,
  licenseStatusLabel,
  type LicenseStatusCode,
} from "@/lib/licenses/license-presentation";
import type {
  LicenseActionField,
  LicenseActionResult,
} from "@/lib/server/licenses/license-action-core";

import { changeLicenseTermsAction, createLicenseAction } from "./actions";

export type LicenseFormTenantOption = Readonly<{
  id: string;
  legalName: string;
}>;
export type LicenseFormInitialValues = Readonly<{
  currentValidFrom?: string;
  currentValidUntil?: string | null;
  expectedRevision?: number;
  licenseId?: string;
  planKey: string;
  status?: LicenseStatusCode;
  tenantId: string;
  tenantLegalName?: string;
  validFrom: string;
  validUntil: string;
}>;

const INPUT_CLASS =
  "mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 shadow-sm outline-none transition focus:border-stone-600 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100";

function FieldError({
  field,
  result,
}: Readonly<{
  field: LicenseActionField;
  result: LicenseActionResult | null;
}>) {
  if (result === null || result.ok) return null;
  const errors = result.fieldErrors?.[field];
  if (!errors?.length) return null;
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

// create: full target image. edit: draft replaces the full target image,
// active/suspended change plan only (dates change through renewal).
export function LicenseForm({
  initialValues,
  mode,
  tenantOptions = [],
}: Readonly<{
  initialValues: LicenseFormInitialValues;
  mode: "create" | "edit";
  tenantOptions?: readonly LicenseFormTenantOption[];
}>) {
  const action =
    mode === "create" ? createLicenseAction : changeLicenseTermsAction;
  const [result, formAction, isPending] = useActionState<
    LicenseActionResult | null,
    FormData
  >(action, null);
  const [tenantId, setTenantId] = useState(initialValues.tenantId);
  const [planKey, setPlanKey] = useState(initialValues.planKey);
  const [validFrom, setValidFrom] = useState(initialValues.validFrom);
  const [validUntil, setValidUntil] = useState(initialValues.validUntil);
  const summaryRef = useRef<HTMLDivElement>(null);
  const datesEditable = mode === "create" || initialValues.status === "draft";

  useEffect(() => {
    if (result && !result.ok) summaryRef.current?.focus();
  }, [result]);

  const hasError = (field: LicenseActionField) =>
    result !== null &&
    !result.ok &&
    Boolean(result.fieldErrors?.[field]?.length);
  const describedBy = (field: LicenseActionField, helpId?: string) =>
    [helpId, hasError(field) ? `${field}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  const cancelHref =
    mode === "edit" && initialValues.licenseId
      ? `/licenses/${initialValues.licenseId}`
      : "/licenses";

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
          {result.code === "conflict" ||
          result.code === "invalid_state_transition" ? (
            <p className="mt-2 text-sm text-red-800">
              Licensen har ändrats sedan sidan laddades. Gå tillbaka till detail
              och öppna ändringen igen innan du försöker på nytt.
            </p>
          ) : null}
          {result.code === "validation_error" && mode === "edit" ? (
            <p className="mt-2 text-sm text-red-800">
              Kontrollera att villkoren faktiskt ändras och att starttiden inte
              ligger bakåt i tiden.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <>
          <input
            name="licenseId"
            type="hidden"
            value={initialValues.licenseId}
          />
          <input
            name="expectedRevision"
            type="hidden"
            value={initialValues.expectedRevision}
          />
        </>
      ) : null}

      <section
        aria-labelledby="license-form-terms"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="license-form-terms"
        >
          {mode === "create" ? "Licens" : "Villkor"}
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="tenantId"
            >
              Tenant
            </label>
            {mode === "create" ? (
              <select
                aria-describedby={describedBy("tenantId", "tenantId-help")}
                aria-invalid={hasError("tenantId")}
                className={INPUT_CLASS}
                disabled={isPending}
                id="tenantId"
                name="tenantId"
                onChange={(event) => setTenantId(event.target.value)}
                required
                value={tenantId}
              >
                <option value="">Välj tenant</option>
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.legalName}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-stone-900">
                {initialValues.tenantLegalName}{" "}
                <span className="text-stone-500">(kan inte ändras)</span>
              </p>
            )}
            {mode === "create" ? (
              <p className="mt-2 text-xs text-stone-500" id="tenantId-help">
                Endast aktiva tenants. En tenant kan ha högst en licens som inte
                är avslutad.
              </p>
            ) : null}
            <FieldError field="tenantId" result={result} />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="planKey"
            >
              Paket
            </label>
            <select
              aria-describedby={describedBy("planKey", "planKey-help")}
              aria-invalid={hasError("planKey")}
              className={INPUT_CLASS}
              disabled={isPending}
              id="planKey"
              name="planKey"
              onChange={(event) => setPlanKey(event.target.value)}
              required
              value={planKey}
            >
              {LICENSE_PLAN_OPTIONS.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.label} – högst {plan.maxActiveUsers} aktiverade
                  användarkonton
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-stone-500" id="planKey-help">
              Kapaciteten gäller hela tenanten och delas av alla installationer.
            </p>
            <FieldError field="planKey" result={result} />
          </div>

          {mode === "edit" && initialValues.status ? (
            <div>
              <p className="text-sm font-medium text-stone-800">
                Administrativ status
              </p>
              <p className="mt-2 text-sm text-stone-900">
                <StatusText>
                  {licenseStatusLabel(initialValues.status)}
                </StatusText>{" "}
                <span className="text-stone-500">(kan inte ändras här)</span>
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="license-form-validity"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="license-form-validity"
        >
          Giltighet
        </h2>
        {datesEditable ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label
                className="block text-sm font-medium text-stone-800"
                htmlFor="validFrom"
              >
                Giltig från
              </label>
              <input
                aria-describedby={describedBy("validFrom", "validFrom-help")}
                aria-invalid={hasError("validFrom")}
                className={INPUT_CLASS}
                disabled={isPending}
                id="validFrom"
                name="validFrom"
                onChange={(event) => setValidFrom(event.target.value)}
                step={1}
                type="datetime-local"
                value={validFrom}
              />
              <p className="mt-2 text-xs text-stone-500" id="validFrom-help">
                Svensk tid. Lämna tomt för att börja när ändringen sparas.
                Bakåtdatering är inte tillåten.
                {mode === "edit" && initialValues.currentValidFrom
                  ? ` Nuvarande start: ${formatLicenseDateTime(initialValues.currentValidFrom)}.`
                  : ""}
              </p>
              <FieldError field="validFrom" result={result} />
            </div>
            <div>
              <label
                className="block text-sm font-medium text-stone-800"
                htmlFor="validUntil"
              >
                Giltig till
              </label>
              <input
                aria-describedby={describedBy("validUntil", "validUntil-help")}
                aria-invalid={hasError("validUntil")}
                className={INPUT_CLASS}
                disabled={isPending}
                id="validUntil"
                name="validUntil"
                onChange={(event) => setValidUntil(event.target.value)}
                step={1}
                type="datetime-local"
                value={validUntil}
              />
              <p className="mt-2 text-xs text-stone-500" id="validUntil-help">
                Svensk tid, exklusiv sluttid. Lämna tomt för Tills vidare.
              </p>
              <FieldError field="validUntil" result={result} />
            </div>
          </div>
        ) : (
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-stone-800">
                Giltig från
              </dt>
              <dd className="mt-2 text-sm text-stone-900">
                {initialValues.currentValidFrom
                  ? formatLicenseDateTime(initialValues.currentValidFrom)
                  : "Saknas"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-stone-800">
                Giltig till
              </dt>
              <dd className="mt-2 text-sm text-stone-900">
                {formatLicenseValidUntil(
                  initialValues.currentValidUntil ?? null,
                )}
              </dd>
            </div>
            <p className="text-xs text-stone-500 sm:col-span-2">
              Efter aktivering ändras endast paketet här. Datum ändras genom
              förnyelse på licensens detailsida.
            </p>
          </dl>
        )}
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
          className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:bg-stone-400"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? mode === "create"
              ? "Skapar…"
              : "Sparar…"
            : mode === "create"
              ? "Skapa licens"
              : "Spara villkor"}
        </button>
      </div>
    </form>
  );
}
