"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import type { InstallationActionResult } from "@/lib/server/installations/installation-action-core";
import type { InstallationAdministrativeStatus } from "@/lib/server/installations";

import {
  activateInstallationAction,
  archiveInstallationAction,
  decommissionInstallationAction,
  pauseInstallationAction,
  restoreInstallationAction,
} from "./actions";

type LifecycleOperation =
  "activate" | "archive" | "decommission" | "pause" | "restore";

type OperationDefinition = Readonly<{
  action: (
    state: InstallationActionResult | null,
    formData: FormData,
  ) => Promise<InstallationActionResult>;
  confirmLabel: string;
  description: string;
  pendingLabel: string;
  title: string;
  triggerLabel: string;
}>;

const OPERATIONS: Readonly<Record<LifecycleOperation, OperationDefinition>> =
  Object.freeze({
    activate: {
      action: activateInstallationAction,
      confirmLabel: "Aktivera installation",
      description:
        "Installationen markeras som Aktiv. Det är en administrativ status och verifierar inte faktisk systemhälsa, provisioning eller deployment.",
      pendingLabel: "Aktiverar…",
      title: "Bekräfta aktivering",
      triggerLabel: "Aktivera",
    },
    archive: {
      action: archiveInstallationAction,
      confirmLabel: "Arkivera installation",
      description:
        "Installationen försvinner från standardlistan, men data och audit raderas inte. Status förblir Avvecklad och återställning återger endast synlighet. Ingen teknisk miljö tas bort.",
      pendingLabel: "Arkiverar…",
      title: "Bekräfta arkivering",
      triggerLabel: "Arkivera",
    },
    decommission: {
      action: decommissionInstallationAction,
      confirmLabel: "Avveckla installation",
      description:
        "Installationen markeras som Avvecklad och kan inte aktiveras igen genom normal lifecycle i V1. Den kan därefter arkiveras. Ingen fysisk radering, teknisk nedmontering eller provisioning/deployment teardown sker.",
      pendingLabel: "Avvecklar…",
      title: "Bekräfta avveckling",
      triggerLabel: "Avveckla",
    },
    pause: {
      action: pauseInstallationAction,
      confirmLabel: "Pausa installation",
      description:
        "Installationen markeras som Pausad. Åtgärden är reversibel och varken tenant eller installation raderas. Monitoring eller provisioning påverkas inte av detta steg.",
      pendingLabel: "Pausar…",
      title: "Bekräfta paus",
      triggerLabel: "Pausa",
    },
    restore: {
      action: restoreInstallationAction,
      confirmLabel: "Återställ installation",
      description:
        "Installationen blir synlig i listan igen men status förblir Avvecklad; den blir inte Aktiv. Ett nytt system måste registreras eller provisioneras genom en senare administrativ åtgärd.",
      pendingLabel: "Återställer…",
      title: "Bekräfta återställning",
      triggerLabel: "Återställ",
    },
  });

function LifecycleAction({
  activeOperation,
  expectedRevision,
  installationId,
  onFinish,
  onStart,
  operation,
}: Readonly<{
  activeOperation: LifecycleOperation | null;
  expectedRevision: number;
  installationId: string;
  onFinish(operation: LifecycleOperation): void;
  onStart(operation: LifecycleOperation): void;
  operation: LifecycleOperation;
}>) {
  const definition = OPERATIONS[operation];
  const [result, formAction, isPending] = useActionState<
    InstallationActionResult | null,
    FormData
  >(definition.action, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingSeenRef = useRef(false);
  const identifier = useId();
  const isArchive = operation === "archive";
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

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        aria-disabled={controlsLocked}
        className={
          isArchive
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

          <input name="installationId" type="hidden" value={installationId} />
          <input
            name="expectedRevision"
            type="hidden"
            value={expectedRevision}
          />

          {result && !result.ok ? (
            <div
              className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              <p>{result.message}</p>
              {result.code === "conflict" ? (
                <p className="mt-2">
                  Installationen har ändrats sedan sidan laddades. Stäng
                  dialogen och ladda om detail innan du försöker igen.
                </p>
              ) : null}
              {result.code === "invalid_state_transition" ? (
                <p className="mt-2">
                  Installationens status kan ha ändrats. Stäng dialogen och
                  ladda om detail.
                </p>
              ) : null}
              {result.code === "tenant_not_available" ? (
                <p className="mt-2">
                  Tenantens aktuella läge blockerar åtgärden. Stäng dialogen och
                  kontrollera aktuell information innan du fortsätter.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              className="rounded-md px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:cursor-not-allowed disabled:text-stone-400"
              disabled={isPending}
              onClick={closeDialog}
              ref={cancelRef}
              type="button"
            >
              Avbryt
            </button>
            <button
              aria-disabled={isPending}
              className={
                isArchive
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

export function InstallationLifecycleControls({
  administrativeStatus,
  archived,
  expectedRevision,
  installationId,
}: Readonly<{
  administrativeStatus: InstallationAdministrativeStatus;
  archived: boolean;
  expectedRevision: number;
  installationId: string;
}>) {
  const [activeOperation, setActiveOperation] =
    useState<LifecycleOperation | null>(null);
  const operations: readonly LifecycleOperation[] = archived
    ? ["restore"]
    : administrativeStatus === "planned"
      ? ["activate", "decommission"]
      : administrativeStatus === "active"
        ? ["pause", "decommission"]
        : administrativeStatus === "paused"
          ? ["activate", "decommission"]
          : ["archive"];

  return (
    <section
      aria-labelledby="installation-lifecycle-actions"
      className="rounded-md border border-stone-300 bg-white p-5"
    >
      <h2
        className="text-base font-semibold text-stone-950"
        id="installation-lifecycle-actions"
      >
        Åtgärder
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        Tillgängliga åtgärder styrs av installationens aktuella administrativa
        status.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {operations.map((operation) => (
          <LifecycleAction
            activeOperation={activeOperation}
            expectedRevision={expectedRevision}
            installationId={installationId}
            key={operation}
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
    </section>
  );
}
