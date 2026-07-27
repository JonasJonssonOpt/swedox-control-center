"use client";

import { useActionState, useId, useRef } from "react";

import type { TenantActionResult } from "@/lib/server/tenants/tenant-action-core";
import type { TenantOperationalStatus } from "@/lib/server/tenants";

import {
  activateTenantAction,
  archiveTenantAction,
  pauseTenantAction,
  restoreTenantAction,
} from "./actions";

type LifecycleOperation = "activate" | "archive" | "pause" | "restore";

type OperationDefinition = Readonly<{
  action: (
    state: TenantActionResult | null,
    formData: FormData,
  ) => Promise<TenantActionResult>;
  confirmLabel: string;
  description: string;
  pendingLabel: string;
  title: string;
  triggerLabel: string;
}>;

const OPERATIONS: Readonly<Record<LifecycleOperation, OperationDefinition>> =
  Object.freeze({
    activate: {
      action: activateTenantAction,
      confirmLabel: "Aktivera tenant",
      description:
        "Tenant återgår till aktiv operativ status. Befintliga uppgifter ändras inte.",
      pendingLabel: "Aktiverar…",
      title: "Bekräfta aktivering",
      triggerLabel: "Aktivera",
    },
    archive: {
      action: archiveTenantAction,
      confirmLabel: "Arkivera tenant",
      description:
        "Tenant tas bort från den aktiva tenantlistan men raderas inte. Historik och uppgifter bevaras.",
      pendingLabel: "Arkiverar…",
      title: "Bekräfta arkivering",
      triggerLabel: "Arkivera",
    },
    pause: {
      action: pauseTenantAction,
      confirmLabel: "Pausa tenant",
      description:
        "Tenant får pausad operativ status. Åtgärden kan senare återställas genom aktivering.",
      pendingLabel: "Pausar…",
      title: "Bekräfta paus",
      triggerLabel: "Pausa",
    },
    restore: {
      action: restoreTenantAction,
      confirmLabel: "Återställ tenant",
      description:
        "Tenant återförs till den aktiva tenantlistan och får aktiv operativ status.",
      pendingLabel: "Återställer…",
      title: "Bekräfta återställning",
      triggerLabel: "Återställ",
    },
  });

function LifecycleAction({
  expectedRevision,
  operation,
  tenantId,
}: Readonly<{
  expectedRevision: number;
  operation: LifecycleOperation;
  tenantId: string;
}>) {
  const definition = OPERATIONS[operation];
  const [result, formAction, isPending] = useActionState<
    TenantActionResult | null,
    FormData
  >(definition.action, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const identifier = useId();
  const isArchive = operation === "archive";

  function openDialog() {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => cancelRef.current?.focus());
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className={
          isArchive
            ? "rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            : "rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        }
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        {definition.triggerLabel}
      </button>

      <dialog
        aria-describedby={`${identifier}-description`}
        aria-labelledby={`${identifier}-title`}
        className="m-auto w-full max-w-md rounded-lg border border-stone-300 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-black/30"
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <form action={formAction} className="p-6">
          <h2 className="text-lg font-semibold" id={`${identifier}-title`}>
            {definition.title}
          </h2>
          <p
            className="mt-3 text-sm leading-6 text-stone-600"
            id={`${identifier}-description`}
          >
            {definition.description}
          </p>

          <input name="tenantId" type="hidden" value={tenantId} />
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
                  Tenant har ändrats sedan sidan laddades. Stäng dialogen och
                  ladda om detail innan du försöker igen.
                </p>
              ) : null}
              {result.code === "invalid_state_transition" ? (
                <p className="mt-2">
                  Status kan ha ändrats. Stäng dialogen och ladda om detail.
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

export function TenantLifecycleControls({
  archived,
  expectedRevision,
  operationalStatus,
  tenantId,
}: Readonly<{
  archived: boolean;
  expectedRevision: number;
  operationalStatus: TenantOperationalStatus;
  tenantId: string;
}>) {
  const sharedProps = { expectedRevision, tenantId };

  if (archived) {
    return (
      <section
        aria-labelledby="tenant-restore-actions"
        className="rounded-lg border border-stone-200 bg-white p-5"
      >
        <h2
          className="text-sm font-semibold text-stone-950"
          id="tenant-restore-actions"
        >
          Återställ tenant
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Återställning gör tenant aktiv och synlig i tenantlistan igen.
        </p>
        <div className="mt-4">
          <LifecycleAction operation="restore" {...sharedProps} />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="tenant-lifecycle-actions"
      className="rounded-lg border border-stone-200 bg-white p-5"
    >
      <h2
        className="text-sm font-semibold text-stone-950"
        id="tenant-lifecycle-actions"
      >
        Livscykel
      </h2>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
            Operativ status
          </p>
          <LifecycleAction
            operation={operationalStatus === "active" ? "pause" : "activate"}
            {...sharedProps}
          />
        </div>
        <div className="border-l border-stone-200 pl-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-red-700">
            Arkivering
          </p>
          <LifecycleAction operation="archive" {...sharedProps} />
        </div>
      </div>
    </section>
  );
}
