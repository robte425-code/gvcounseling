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
  const base = `${portalButtonSecondaryClass} px-3 py-1 text-xs`;
  return variant === "danger" ? `${base} text-red-700 hover:bg-red-50` : base;
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
      className="flex flex-wrap items-center gap-2"
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
