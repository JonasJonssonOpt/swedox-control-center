"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  formatLicenseValidUntil,
  licenseOperations,
  type LicenseLifecycleOperation as LifecycleOperation,
  type LicenseStatusCode,
  type LicenseValidityCode,
} from "@/lib/licenses/license-presentation";
import type { LicenseActionResult } from "@/lib/server/licenses/license-action-core";

import {
  activateLicenseAction,
  renewLicenseAction,
  suspendLicenseAction,
  terminateLicenseAction,
} from "./actions";

type OperationDefinition = Readonly<{
  action: (
    state: LicenseActionResult | null,
    formData: FormData,
  ) => Promise<LicenseActionResult>;
  confirmLabel: string;
  description: string;
  pendingLabel: string;
  title: string;
  triggerLabel: string;
}>;

const OPERATIONS: Readonly<Record<LifecycleOperation, OperationDefinition>> =
  Object.freeze({
    activate: {
      action: activateLicenseAction,
      confirmLabel: "Aktivera licens",
      description:
        "Licensen blir administrativt beviljad. Tidsmässig giltighet bedöms separat: en framtida start ger Ej påbörjad tills starttiden nåtts. Ingen installation eller körande SweDox ändras.",
      pendingLabel: "Aktiverar…",
      title: "Bekräfta aktivering",
      triggerLabel: "Aktivera",
    },
    reactivate: {
      action: activateLicenseAction,
      confirmLabel: "Återaktivera licens",
      description:
        "Spärren hävs och licensen blir Aktiv igen. Datum förlängs inte; en utgången licens måste förnyas först.",
      pendingLabel: "Återaktiverar…",
      title: "Bekräfta återaktivering",
      triggerLabel: "Återaktivera",
    },
    renew: {
      action: renewLicenseAction,
      confirmLabel: "Förnya licens",
      description:
        "En ny villkorsversion skapas med samma paket. Före utgång flyttas sluttiden framåt; efter utgång börjar en ny period när förnyelsen sparas och avbrottet bevaras i historiken. Administrativ status ändras inte.",
      pendingLabel: "Förnyar…",
      title: "Förnya licens",
      triggerLabel: "Förnya",
    },
    suspend: {
      action: suspendLicenseAction,
      confirmLabel: "Spärra licens",
      description:
        "Licensen spärras tillfälligt oavsett datum och ger inte provisioning-behörighet. Åtgärden är reversibel genom återaktivering och ingenting raderas.",
      pendingLabel: "Spärrar…",
      title: "Bekräfta spärr",
      triggerLabel: "Spärra",
    },
    terminate: {
      action: terminateLicenseAction,
      confirmLabel: "Avsluta licens",
      description:
        "Licensen avslutas permanent och kan aldrig återaktiveras, förnyas eller ändras. Historik och villkor bevaras och inget raderas. En ny licens kan därefter skapas för tenanten.",
      pendingLabel: "Avslutar…",
      title: "Bekräfta avslut",
      triggerLabel: "Avsluta",
    },
  });

function RenewFields({
  currentValidUntil,
  disabled,
  result,
}: Readonly<{
  currentValidUntil: string | null;
  disabled: boolean;
  result: LicenseActionResult | null;
}>) {
  const identifier = useId();
  const [openEnded, setOpenEnded] = useState(false);
  const errors =
    result && !result.ok
      ? [
          ...(result.fieldErrors?.validUntil ?? []),
          ...(result.fieldErrors?.openEnded ?? []),
        ]
      : [];
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-stone-700">
        Nuvarande sluttid: {formatLicenseValidUntil(currentValidUntil)}
      </p>
      <div>
        <label
          className="block text-sm font-medium text-stone-800"
          htmlFor={`${identifier}-until`}
        >
          Ny sluttid (svensk tid)
        </label>
        <input
          aria-describedby={errors.length ? `${identifier}-error` : undefined}
          aria-invalid={errors.length > 0}
          className="mt-2 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 disabled:cursor-not-allowed disabled:bg-stone-100"
          disabled={disabled || openEnded}
          id={`${identifier}-until`}
          name="validUntil"
          step={1}
          type="datetime-local"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-800">
        <input
          checked={openEnded}
          className="size-4 rounded border-stone-400"
          disabled={disabled}
          name="openEnded"
          onChange={(event) => setOpenEnded(event.target.checked)}
          type="checkbox"
          value="true"
        />
        Tills vidare (ingen sluttid)
      </label>
      {errors.length ? (
        <div className="space-y-1" id={`${identifier}-error`}>
          {errors.map((error) => (
            <p className="text-sm text-red-700" key={error}>
              {error}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LifecycleAction({
  activeOperation,
  currentValidUntil,
  expectedRevision,
  licenseId,
  onFinish,
  onStart,
  operation,
}: Readonly<{
  activeOperation: LifecycleOperation | null;
  currentValidUntil: string | null;
  expectedRevision: number;
  licenseId: string;
  onFinish(operation: LifecycleOperation): void;
  onStart(operation: LifecycleOperation): void;
  operation: LifecycleOperation;
}>) {
  const definition = OPERATIONS[operation];
  const [result, formAction, isPending] = useActionState<
    LicenseActionResult | null,
    FormData
  >(definition.action, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingSeenRef = useRef(false);
  const identifier = useId();
  const isDestructive = operation === "terminate";
  const controlsLocked = activeOperation !== null;

  useEffect(() => {
    if (isPending) {
      pendingSeenRef.current = true;
    } else if (pendingSeenRef.current) {
      pendingSeenRef.current = false;
      onFinish(operation);
    }
  }, [isPending, onFinish, operation]);

  function openDialog() {
    if (controlsLocked) return;
    dialogRef.current?.showModal();
    requestAnimationFrame(() => cancelRef.current?.focus());
  }

  return (
    <>
      <button
        aria-disabled={controlsLocked}
        className={
          isDestructive
            ? "rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
            : "rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
        }
        disabled={controlsLocked}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        {definition.triggerLabel}
      </button>

      <dialog
        aria-describedby={`${identifier}-description`}
        aria-labelledby={`${identifier}-title`}
        className="m-auto w-full max-w-lg rounded-lg border border-stone-300 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-black/30"
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <form
          action={formAction}
          className="p-6"
          onSubmit={() => onStart(operation)}
        >
          <h2 className="text-lg font-semibold" id={`${identifier}-title`}>
            {definition.title}
          </h2>
          <p
            className="mt-3 text-sm leading-6 text-stone-600"
            id={`${identifier}-description`}
          >
            {definition.description}
          </p>

          <input name="licenseId" type="hidden" value={licenseId} />
          <input
            name="expectedRevision"
            type="hidden"
            value={expectedRevision}
          />
          {operation === "renew" ? (
            <RenewFields
              currentValidUntil={currentValidUntil}
              disabled={isPending}
              result={result}
            />
          ) : null}

          {result && !result.ok ? (
            <div
              className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              <p>{result.message}</p>
              {result.code === "conflict" ? (
                <p className="mt-2">
                  Licensen har ändrats sedan sidan laddades. Stäng dialogen och
                  ladda om detail innan du försöker igen.
                </p>
              ) : null}
              {result.code === "invalid_state_transition" ? (
                <p className="mt-2">
                  Licensens status eller giltighet tillåter inte åtgärden. Stäng
                  dialogen och ladda om detail.
                </p>
              ) : null}
              {result.code === "tenant_not_available" ? (
                <p className="mt-2">
                  Tenanten är pausad eller arkiverad. Kontrollera tenanten innan
                  du fortsätter.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              className="rounded-md px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
              disabled={isPending}
              onClick={() => dialogRef.current?.close()}
              ref={cancelRef}
              type="button"
            >
              Avbryt
            </button>
            <button
              aria-disabled={isPending}
              className={
                isDestructive
                  ? "rounded-md bg-red-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                  : "rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:bg-stone-400"
              }
              disabled={isPending}
              type="submit"
            >
              {isPending ? definition.pendingLabel : definition.confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function LicenseLifecycleControls({
  expectedRevision,
  licenseId,
  status,
  validUntil,
  validity,
}: Readonly<{
  expectedRevision: number;
  licenseId: string;
  status: LicenseStatusCode;
  validUntil: string | null;
  validity: LicenseValidityCode;
}>) {
  const [activeOperation, setActiveOperation] =
    useState<LifecycleOperation | null>(null);
  const operations = licenseOperations(status, validity, validUntil === null);
  const notes: string[] = [];
  if (status === "terminated")
    notes.push(
      "Avslutad licens kan inte ändras. Skapa en ny licens om tenanten behöver en ny rättighet.",
    );
  if (validity === "expired" && status === "draft")
    notes.push(
      "Utkastets sluttid har passerats. Ändra villkoren innan licensen kan aktiveras.",
    );
  if (validity === "expired" && status === "suspended")
    notes.push(
      "Licensen har gått ut och måste förnyas innan den kan återaktiveras.",
    );
  if (validUntil === null && (status === "active" || status === "suspended"))
    notes.push("Licensen gäller Tills vidare och behöver ingen förnyelse.");

  return (
    <section
      aria-labelledby="license-lifecycle-actions"
      className="rounded-md border border-stone-300 bg-white p-5"
    >
      <h2
        className="text-base font-semibold text-stone-950"
        id="license-lifecycle-actions"
      >
        Åtgärder
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        Tillgängliga åtgärder styrs av licensens administrativa status och
        giltighet.
      </p>
      {notes.map((note) => (
        <p className="mt-2 text-sm text-stone-700" key={note}>
          {note}
        </p>
      ))}
      {operations.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {operations.map((operation) => (
            <LifecycleAction
              activeOperation={activeOperation}
              currentValidUntil={validUntil}
              expectedRevision={expectedRevision}
              key={operation}
              licenseId={licenseId}
              onFinish={(finishedOperation) =>
                setActiveOperation((current) =>
                  current === finishedOperation ? null : current,
                )
              }
              onStart={setActiveOperation}
              operation={operation}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
