"use client";

import {
  closeClientAction,
  deleteClientAction,
  reopenClientAction,
} from "@/lib/portal-actions";
import { portalButtonSecondaryClass } from "@/components/portal/ui";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";

type Props = {
  clientId: string;
  clientLabel: string;
  assignmentStatus: ClientAssignmentStatus;
  invoiceCount: number;
  returnTo: string;
};

function stopRowNavigation(event: React.MouseEvent | React.KeyboardEvent) {
  event.stopPropagation();
}

function actionButtonClassName(variant: "default" | "danger" = "default"): string {
  const base =
    "rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  if (variant === "danger") {
    return `${base} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`;
  }
  return `${base} border-border bg-surface text-foreground hover:border-primary/40 hover:bg-primary/5`;
}

export function ClientListStatusActions({
  clientId,
  clientLabel,
  assignmentStatus,
  invoiceCount,
  returnTo,
}: Props) {
  const canDelete = invoiceCount === 0;

  function confirmDelete(event: React.FormEvent<HTMLFormElement>) {
    stopRowNavigation(event as unknown as React.MouseEvent);
    if (!window.confirm(`Delete ${clientLabel}? This cannot be undone.`)) {
      event.preventDefault();
    }
  }

  return (
    <div
      className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-border/80 bg-muted/5 p-1.5"
      onClick={stopRowNavigation}
      onKeyDown={stopRowNavigation}
    >
      {assignmentStatus === "ACTIVE" && (
        <form action={closeClientAction} className="inline">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={actionButtonClassName()} onClick={stopRowNavigation}>
            Close
          </button>
        </form>
      )}

      {assignmentStatus === "CLOSED" && (
        <form action={reopenClientAction} className="inline">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={actionButtonClassName()} onClick={stopRowNavigation}>
            Reactivate
          </button>
        </form>
      )}

      <form action={deleteClientAction} className="inline" onSubmit={confirmDelete}>
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          type="submit"
          disabled={!canDelete}
          title={
            canDelete
              ? "Delete client"
              : "Cannot delete a client with invoices"
          }
          className={actionButtonClassName("danger")}
          onClick={stopRowNavigation}
        >
          Delete
        </button>
      </form>
    </div>
  );
}
