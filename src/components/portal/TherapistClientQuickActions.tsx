"use client";

import Link from "next/link";
import { useState } from "react";
import { closeClientAction, reopenClientAction } from "@/lib/portal-actions";
import { ClientStatusReasonDialog } from "@/components/portal/ClientStatusReasonDialog";
import { canTherapistCloseClient } from "@/lib/client-assignment-status";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";
import { portalButtonSecondaryClass } from "@/components/portal/ui";

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

function actionButtonClassName(): string {
  return "rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5";
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

  return (
    <>
      <div
        className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-border/80 bg-muted/5 p-1.5"
        onClick={stopRowNavigation}
        onKeyDown={stopRowNavigation}
      >
        {assignmentStatus === "ACTIVE" && (
          <Link
            href={`/portal/therapist/invoices/new?clientId=${clientId}`}
            className={`${portalButtonSecondaryClass} px-2.5 py-1 text-xs`}
            onClick={stopRowNavigation}
          >
            New invoice
          </Link>
        )}

        {assignmentStatus === "PENDING_THERAPIST" && (
          <Link
            href={`/portal/therapist/referrals/${clientId}`}
            className={`${portalButtonSecondaryClass} px-2.5 py-1 text-xs`}
            onClick={stopRowNavigation}
          >
            Review referral
          </Link>
        )}

        {canClose && (
          <button
            type="button"
            className={actionButtonClassName()}
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
            className={actionButtonClassName()}
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
