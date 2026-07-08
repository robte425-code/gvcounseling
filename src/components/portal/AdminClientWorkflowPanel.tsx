"use client";

import { useState } from "react";
import {
  assignClientTherapistAction,
  reopenClientAction,
} from "@/lib/portal-actions";
import { ClientStatusReasonDialog } from "@/components/portal/ClientStatusReasonDialog";
import { ClientCloseButton } from "@/components/portal/ClientCloseButton";
import { ClientVrcReferralActions } from "@/components/portal/ClientVrcReferralActions";
import { canAdminCloseClient } from "@/lib/client-assignment-status";
import {
  portalButtonClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
  portalSectionHeadingClass,
  StatusBadge,
} from "@/components/portal/ui";
import type { OutboundEmailRoute } from "@/lib/portal-settings";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";

type DialogKind = "reopen" | null;

type TherapistOption = { id: string; firstName: string; lastName: string };

type Props = {
  clientId: string;
  clientLabel: string;
  assignmentStatus: ClientAssignmentStatus;
  rejectionReason: string | null;
  therapistName: string | null;
  therapists: TherapistOption[];
  vrcEmail: string | null;
  vrcName: string | null;
  vrcRoute: OutboundEmailRoute;
  adminEmails: string[];
  returnTo: string;
};

function statusMessage(
  assignmentStatus: ClientAssignmentStatus,
  rejectionReason: string | null,
): string | null {
  switch (assignmentStatus) {
    case "PENDING_THERAPIST":
      return "Waiting for the assigned therapist to accept or decline this referral.";
    case "CLOSED":
      return "This client is closed. Reactivate to resume billing and move their Drive folder back to the therapist's active client folder.";
    case "REJECTED_BY_ADMIN":
      return rejectionReason
        ? `Rejected: ${rejectionReason}. Reopen to return this referral to the unassigned queue.`
        : "This referral was rejected. Reopen to return it to the unassigned queue for reassignment.";
    case "UNASSIGNED":
      return "This referral needs VRC outreach and therapist assignment.";
    default:
      return null;
  }
}

export function AdminClientWorkflowPanel({
  clientId,
  clientLabel,
  assignmentStatus,
  rejectionReason,
  therapistName,
  therapists,
  vrcEmail,
  vrcName,
  vrcRoute,
  adminEmails,
  returnTo,
}: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  const canClose = canAdminCloseClient(assignmentStatus);
  const canReopen =
    assignmentStatus === "CLOSED" || assignmentStatus === "REJECTED_BY_ADMIN";
  const showVrcAndAssign = assignmentStatus === "UNASSIGNED";
  const message = statusMessage(assignmentStatus, rejectionReason);
  const reopenLabel =
    assignmentStatus === "REJECTED_BY_ADMIN" ? "Reopen referral" : "Reactivate client";

  const hasHeaderActions = canClose || canReopen;

  return (
    <>
      <section className={portalCardClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <p className={portalSectionHeadingClass}>Workflow</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={assignmentStatus} />
              <span className="text-sm text-muted">
                Therapist: {therapistName ?? "Unassigned"}
              </span>
            </div>
            {message && (
              <p
                className={`text-sm ${
                  assignmentStatus === "PENDING_THERAPIST"
                    ? "text-amber-900"
                    : assignmentStatus === "REJECTED_BY_ADMIN"
                      ? "text-red-800"
                      : "text-muted"
                }`}
              >
                {message}
              </p>
            )}
            {assignmentStatus === "UNASSIGNED" && rejectionReason && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Previous therapist declined: {rejectionReason}
              </p>
            )}
          </div>

          {hasHeaderActions && (
            <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
              {canClose && (
                <ClientCloseButton
                  clientId={clientId}
                  clientLabel={clientLabel}
                  returnTo={returnTo}
                />
              )}
              {canReopen && (
                <button
                  type="button"
                  onClick={() => setDialog("reopen")}
                  className={portalButtonClass}
                >
                  {reopenLabel}
                </button>
              )}
            </div>
          )}
        </div>

        {assignmentStatus === "ACTIVE" && (
          <p className="mt-4 text-sm text-muted">
            This client is active. Close when billing is complete and the case should move to closed
            cases in Drive.
          </p>
        )}

        {showVrcAndAssign && (
          <div className="mt-6 grid gap-6 border-t border-border pt-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-serif text-lg text-primary-dark">VRC referral</h3>
              <ClientVrcReferralActions
                clientId={clientId}
                vrcEmail={vrcEmail}
                vrcName={vrcName}
                vrcRoute={vrcRoute}
                adminEmails={adminEmails}
                embedded
              />
            </div>

            <div className="space-y-3">
              <h3 className="font-serif text-lg text-primary-dark">Assign therapist</h3>
              <p className="text-sm text-muted">
                Choose a therapist and notify them to review this referral.
              </p>
              <form action={assignClientTherapistAction} className="space-y-4">
                <input type="hidden" name="clientId" value={clientId} />
                <div>
                  <label htmlFor="therapistId" className={portalLabelClass}>
                    Therapist
                  </label>
                  <select id="therapistId" name="therapistId" required className={portalInputClass}>
                    <option value="">Select therapist…</option>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={portalButtonClass}>
                  Assign & notify therapist
                </button>
              </form>
            </div>
          </div>
        )}
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
        titleId="admin-reopen-client-reason"
      />
    </>
  );
}
