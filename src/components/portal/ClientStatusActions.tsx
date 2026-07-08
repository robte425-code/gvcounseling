"use client";

import { useState } from "react";
import {
  adminRejectReferralAction,
  reopenClientAction,
  therapistRejectReferralAction,
} from "@/lib/portal-actions";
import { ClientStatusReasonDialog } from "@/components/portal/ClientStatusReasonDialog";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalSectionHeadingClass,
  StatusBadge,
} from "@/components/portal/ui";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";

type DialogKind = "reopen" | "reject" | null;

type Props = {
  clientId: string;
  clientLabel: string;
  assignmentStatus: ClientAssignmentStatus;
  rejectionReason: string | null;
  role: "admin" | "therapist";
  returnTo: string;
};

export function ClientStatusActions({
  clientId,
  clientLabel,
  assignmentStatus,
  rejectionReason,
  role,
  returnTo,
}: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  const canReopen =
    assignmentStatus === "CLOSED" ||
    (assignmentStatus === "REJECTED_BY_ADMIN" && role === "admin");
  const canRejectUnassigned = role === "admin" && assignmentStatus === "UNASSIGNED";
  const canRejectPending = role === "therapist" && assignmentStatus === "PENDING_THERAPIST";

  const hasActions = canReopen || canRejectUnassigned || canRejectPending;
  if (!hasActions && assignmentStatus !== "REJECTED_BY_ADMIN") {
    return null;
  }

  const reopenLabel =
    assignmentStatus === "REJECTED_BY_ADMIN" ? "Reopen referral" : "Reactivate client";

  return (
    <>
      <section className={portalCardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <p className={portalSectionHeadingClass}>Client status</p>
          <StatusBadge status={assignmentStatus} />
        </div>

        {assignmentStatus === "REJECTED_BY_ADMIN" && rejectionReason && (
          <p className="mt-3 text-sm text-red-800">{rejectionReason}</p>
        )}

        {assignmentStatus === "CLOSED" && (
          <p className="mt-3 text-sm text-muted">
            This client is closed. Reactivate to resume billing and move their Drive folder back to
            the therapist&apos;s active client folder.
          </p>
        )}

        {assignmentStatus === "REJECTED_BY_ADMIN" && role === "admin" && (
          <p className="mt-3 text-sm text-muted">
            Reopen this referral to return it to the unassigned queue for reassignment.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {canReopen && (
            <button type="button" onClick={() => setDialog("reopen")} className={portalButtonClass}>
              {reopenLabel}
            </button>
          )}

          {canRejectUnassigned && (
            <button
              type="button"
              onClick={() => setDialog("reject")}
              className={portalButtonSecondaryClass}
            >
              Reject referral
            </button>
          )}

          {canRejectPending && (
            <button
              type="button"
              onClick={() => setDialog("reject")}
              className={portalButtonSecondaryClass}
            >
              Decline referral
            </button>
          )}
        </div>
      </section>

      <ClientStatusReasonDialog
        open={dialog === "reopen"}
        onClose={() => setDialog(null)}
        title={reopenLabel}
        description={`${reopenLabel} for ${clientLabel}?`}
        submitLabel={reopenLabel}
        formAction={reopenClientAction}
        clientId={clientId}
        returnTo={returnTo}
        titleId="reopen-client-reason"
      />

      <ClientStatusReasonDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title={canRejectPending ? "Decline referral" : "Reject referral"}
        description={
          canRejectPending
            ? `Decline ${clientLabel}? The referral will return to the unassigned queue for admin review.`
            : `Reject ${clientLabel}? The referral will be marked rejected and their Drive folder moved to New Referrals.`
        }
        submitLabel={canRejectPending ? "Decline referral" : "Reject referral"}
        formAction={canRejectPending ? therapistRejectReferralAction : adminRejectReferralAction}
        clientId={clientId}
        returnTo={returnTo}
        titleId="reject-client-reason"
      />
    </>
  );
}
