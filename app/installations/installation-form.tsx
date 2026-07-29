"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { StatusText } from "@/components/ui/status-text";
import type {
  InstallationActionField,
  InstallationActionResult,
} from "@/lib/server/installations/installation-action-core";

import { createInstallationAction, updateInstallationAction } from "./actions";

export type InstallationTenantOption = Readonly<{
  id: string;
  legalName: string;
}>;
export type InstallationFormInitialValues = Readonly<{
  administrativeNote: string;
  administrativeStatus?: "planned" | "active" | "paused" | "decommissioned";
  applicationUrl: string;
  displayName: string;
  environment: "production" | "staging" | "test" | "development";
  expectedRevision?: number;
  hostingRegion: string;
  installationCode: string;
  installationId?: string;
  supabaseProjectRef: string;
  tenantId: string;
  tenantLegalName?: string;
}>;

const INPUT_CLASS =
  "mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 shadow-sm outline-none transition focus:border-stone-600 focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-stone-100";

function environmentLabel(
  value: InstallationFormInitialValues["environment"],
): string {
  switch (value) {
    case "production":
      return "Produktion";
    case "staging":
      return "Staging";
    case "test":
      return "Test";
    case "development":
      return "Utveckling";
  }
}

function statusLabel(
  value: NonNullable<InstallationFormInitialValues["administrativeStatus"]>,
): string {
  switch (value) {
    case "planned":
      return "Planerad";
    case "active":
      return "Aktiv";
    case "paused":
      return "Pausad";
    case "decommissioned":
      return "Avvecklad";
  }
}

function FieldError({
  field,
  result,
}: Readonly<{
  field: InstallationActionField;
  result: InstallationActionResult | null;
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

export function InstallationForm({
  initialValues,
  mode,
  tenantOptions,
}: Readonly<{
  initialValues: InstallationFormInitialValues;
  mode: "create" | "edit";
  tenantOptions: readonly InstallationTenantOption[];
}>) {
  const action =
    mode === "create" ? createInstallationAction : updateInstallationAction;
  const [result, formAction, isPending] = useActionState<
    InstallationActionResult | null,
    FormData
  >(action, null);
  const [tenantId, setTenantId] = useState(initialValues.tenantId);
  const [installationCode, setInstallationCode] = useState(
    initialValues.installationCode,
  );
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [environment, setEnvironment] = useState(initialValues.environment);
  const [applicationUrl, setApplicationUrl] = useState(
    initialValues.applicationUrl,
  );
  const [supabaseProjectRef, setSupabaseProjectRef] = useState(
    initialValues.supabaseProjectRef,
  );
  const [hostingRegion, setHostingRegion] = useState(
    initialValues.hostingRegion,
  );
  const [administrativeNote, setAdministrativeNote] = useState(
    initialValues.administrativeNote,
  );
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && !result.ok) summaryRef.current?.focus();
  }, [result]);

  const hasError = (field: InstallationActionField) =>
    result !== null &&
    !result.ok &&
    Boolean(result.fieldErrors?.[field]?.length);
  const describedBy = (field: InstallationActionField, helpId?: string) =>
    [helpId, hasError(field) ? `${field}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  const cancelHref =
    mode === "edit" && initialValues.installationId
      ? `/installations/${initialValues.installationId}`
      : "/installations";

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
              Installationen har ändrats sedan sidan laddades. Gå tillbaka till
              detail och öppna redigeringen igen innan du försöker på nytt.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <>
          <input
            name="installationId"
            type="hidden"
            value={initialValues.installationId}
          />
          <input
            name="expectedRevision"
            type="hidden"
            value={initialValues.expectedRevision}
          />
        </>
      ) : null}

      <section
        aria-labelledby="installation-form-identity"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="installation-form-identity"
        >
          Identitet
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
                aria-describedby={describedBy("tenantId")}
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
            <FieldError field="tenantId" result={result} />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="installationCode"
            >
              Installationskod
            </label>
            {mode === "create" ? (
              <input
                aria-describedby={describedBy(
                  "installationCode",
                  "installationCode-help",
                )}
                aria-invalid={hasError("installationCode")}
                autoCapitalize="none"
                className={INPUT_CLASS}
                disabled={isPending}
                id="installationCode"
                maxLength={64}
                name="installationCode"
                onChange={(event) => setInstallationCode(event.target.value)}
                required
                value={installationCode}
              />
            ) : (
              <p className="mt-2 text-sm text-stone-900">
                {installationCode}{" "}
                <span className="text-stone-500">(kan inte ändras)</span>
              </p>
            )}
            <p
              className="mt-2 text-xs text-stone-500"
              id="installationCode-help"
            >
              Lowercase bokstäver, siffror och enkla bindestreck.
            </p>
            <FieldError field="installationCode" result={result} />
          </div>

          <div className="sm:col-span-2">
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="displayName"
            >
              Visningsnamn
            </label>
            <input
              aria-describedby={describedBy("displayName")}
              aria-invalid={hasError("displayName")}
              className={INPUT_CLASS}
              disabled={isPending}
              id="displayName"
              maxLength={120}
              name="displayName"
              onChange={(event) => setDisplayName(event.target.value)}
              required
              value={displayName}
            />
            <FieldError field="displayName" result={result} />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-stone-800"
              htmlFor="environment"
            >
              Environment
            </label>
            {mode === "create" ? (
              <select
                aria-describedby={describedBy("environment")}
                aria-invalid={hasError("environment")}
                className={INPUT_CLASS}
                disabled={isPending}
                id="environment"
                name="environment"
                onChange={(event) =>
                  setEnvironment(
                    event.target
                      .value as InstallationFormInitialValues["environment"],
                  )
                }
                required
                value={environment}
              >
                <option value="production">Produktion</option>
                <option value="staging">Staging</option>
                <option value="test">Test</option>
                <option value="development">Utveckling</option>
              </select>
            ) : (
              <p className="mt-2 text-sm text-stone-900">
                {environmentLabel(environment)}{" "}
                <span className="text-stone-500">(kan inte ändras)</span>
              </p>
            )}
            <FieldError field="environment" result={result} />
          </div>

          {mode === "edit" && initialValues.administrativeStatus ? (
            <div>
              <p className="text-sm font-medium text-stone-800">
                Administrativ status
              </p>
              <p className="mt-2 text-sm text-stone-900">
                <StatusText>
                  {statusLabel(initialValues.administrativeStatus)}
                </StatusText>{" "}
                <span className="text-stone-500">(kan inte ändras här)</span>
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="installation-form-technical"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="installation-form-technical"
        >
          Teknisk metadata
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {[
            {
              field: "applicationUrl" as const,
              help: "Absolut HTTPS-adress utan credentials eller fragment.",
              label: "Application URL",
              maxLength: 2048,
              setValue: setApplicationUrl,
              type: "url",
              value: applicationUrl,
            },
            {
              field: "supabaseProjectRef" as const,
              help: "Lowercase alfanumerisk projektreferens.",
              label: "Supabase project ref",
              maxLength: 64,
              setValue: setSupabaseProjectRef,
              value: supabaseProjectRef,
            },
            {
              field: "hostingRegion" as const,
              help: "Lowercase region, exempelvis eu-north-1.",
              label: "Hosting region",
              maxLength: 64,
              setValue: setHostingRegion,
              value: hostingRegion,
            },
          ].map((field) => (
            <div
              className={
                field.field === "applicationUrl" ? "sm:col-span-2" : undefined
              }
              key={field.field}
            >
              <label
                className="block text-sm font-medium text-stone-800"
                htmlFor={field.field}
              >
                {field.label}
              </label>
              <input
                aria-describedby={describedBy(
                  field.field,
                  `${field.field}-help`,
                )}
                aria-invalid={hasError(field.field)}
                autoCapitalize="none"
                className={INPUT_CLASS}
                disabled={isPending}
                id={field.field}
                maxLength={field.maxLength}
                name={field.field}
                onChange={(event) => field.setValue(event.target.value)}
                type={field.type ?? "text"}
                value={field.value}
              />
              <p
                className="mt-2 text-xs text-stone-500"
                id={`${field.field}-help`}
              >
                {field.help}
              </p>
              <FieldError field={field.field} result={result} />
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="installation-form-administration"
        className="rounded-lg border border-stone-200 bg-white p-6"
      >
        <h2
          className="text-base font-semibold text-stone-950"
          id="installation-form-administration"
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
            aria-describedby={describedBy(
              "administrativeNote",
              "administrativeNote-help",
            )}
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
          className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:bg-stone-400"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? mode === "create"
              ? "Skapar…"
              : "Sparar…"
            : mode === "create"
              ? "Skapa installation"
              : "Spara ändringar"}
        </button>
      </div>
    </form>
  );
}
