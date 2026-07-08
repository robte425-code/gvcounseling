"use client";

import Link from "next/link";
import { useState } from "react";
import { closeClientAction, reopenClientAction } from "@/lib/portal-actions";
import { ClientStatusReasonDialog } from "@/components/portal/ClientStatusReasonDialog";
import { canTherapistCloseClient } from "@/lib/client-assignment-status";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";

type DialogKind = "close" | "reopen" | null;

type Props = {
  clientId: string;
  clientLabel: string;
  assignmentStatus: ClientAssignmentStatus;
  returnTo: string;
};

function stopRowNavigation(event: React.MouseEvent | React.KeyboardEvent) {
  event.stopPropagation();
}

export function TherapistClientQuickActions({
  clientId,
  clientLabel,
  assignmentStatus,
  returnTo,
}: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const canClose = canTherapistCloseClient(assignmentStatus);
  const canReopen = assignmentStatus === "CLOSED";

  const compactPrimary = `${portalButtonClass} px-4 py-1.5 text-xs shadow-sm`;
  const compactSecondary = `${portalButtonSecondaryClass} px-4 py-1.5 text-xs`;

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2"
        onClick={stopRowNavigation}
        onKeyDown={stopRowNavigation}
      >
        {assignmentStatus === "ACTIVE" && (
          <Link
            href={`/portal/therapist/invoices/new?clientId=${clientId}`}
            className={compactPrimary}
            onClick={stopRowNavigation}
          >
            New invoice
          </Link>
        )}

        {assignmentStatus === "PENDING_THERAPIST" && (
          <Link
            href={`/portal/therapist/referrals/${clientId}`}
            className={compactPrimary}
            onClick={stopRowNavigation}
          >
            Review
          </Link>
        )}

        {canClose && (
          <button
            type="button"
            className={compactSecondary}
            onClick={(event) => {
              stopRowNavigation(event);
              setDialog("close");
            }}
          >
            Close
          </button>
        )}

        {canReopen && (
          <button
            type="button"
            className={compactPrimary}
            onClick={(event) => {
              stopRowNavigation(event);
              setDialog("reopen");
            }}
          >
            Reactivate
          </button>
        )}
      </div>

      <ClientStatusReasonDialog
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        title="Close client"
        description={`Close ${clientLabel}? Their Google Drive folder will be moved to your closed cases folder.`}
        submitLabel="Close client"
        formAction={closeClientAction}
        clientId={clientId}
        returnTo={returnTo}
        titleId={`therapist-list-close-${clientId}`}
      />

      <ClientStatusReasonDialog
        open={dialog === "reopen"}
        onClose={() => setDialog(null)}
        title="Reactivate client"
        description={`Reactivate ${clientLabel}? Their Google Drive folder will be moved back to your active client folder.`}
        submitLabel="Reactivate client"
        formAction={reopenClientAction}
        clientId={clientId}
        returnTo={returnTo}
        titleId={`therapist-list-reopen-${clientId}`}
      />
    </>
  );
}
