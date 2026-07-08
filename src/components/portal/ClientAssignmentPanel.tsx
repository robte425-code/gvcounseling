import {
  adminRejectReferralAction,
  assignClientTherapistAction,
  reopenClientAction,
} from "@/lib/portal-actions";
import { ClientVrcReferralActions } from "@/components/portal/ClientVrcReferralActions";
import { portalButtonClass, portalButtonSecondaryClass, portalCardClass, portalInputClass, portalLabelClass, StatusBadge } from "@/components/portal/ui";
import type { VrcReferralEmailDestination } from "@/lib/portal-settings";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";

type TherapistOption = { id: string; firstName: string; lastName: string };

type ClientAssignmentPanelProps = {
  clientId: string;
  assignmentStatus: ClientAssignmentStatus;
  rejectionReason: string | null;
  therapists: TherapistOption[];
  vrcEmail: string | null;
  vrcName: string | null;
  emailDestination: VrcReferralEmailDestination;
  adminEmails: string[];
};

export function ClientAssignmentPanel({
  clientId,
  assignmentStatus,
  rejectionReason,
  therapists,
  vrcEmail,
  vrcName,
  emailDestination,
  adminEmails,
}: ClientAssignmentPanelProps) {
  if (assignmentStatus === "PENDING_THERAPIST") {
    return (
      <div className={`${portalCardClass} border-amber-200 bg-amber-50/50`}>
        <p className="text-sm text-amber-900">
          <StatusBadge status="PENDING_THERAPIST" /> Waiting for the assigned therapist to accept
          or decline this referral.
        </p>
      </div>
    );
  }

  if (assignmentStatus === "ACTIVE") return null;

  if (assignmentStatus === "REJECTED_BY_ADMIN") {
    return (
      <div className={`${portalCardClass} border-red-200 bg-red-50/50`}>
        <p className="text-sm text-red-900">This referral was rejected by admin.</p>
        {rejectionReason && <p className="mt-2 text-sm text-red-800">{rejectionReason}</p>}
      </div>
    );
  }

  if (assignmentStatus === "CLOSED") {
    return (
      <div className={`${portalCardClass} space-y-4 border-slate-200 bg-slate-50/50`}>
        <div>
          <StatusBadge status="CLOSED" />
          <p className="mt-3 text-sm text-muted">
            This client is closed. Reactivate to resume billing and move their Drive folder back to
            the therapist&apos;s active client folder.
          </p>
        </div>
        <form action={reopenClientAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="returnTo" value={`/portal/admin/clients/${clientId}`} />
          <button type="submit" className={portalButtonClass}>
            Reactivate client
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`${portalCardClass} space-y-6 border-primary/20`}>
      <ClientVrcReferralActions
        clientId={clientId}
        vrcEmail={vrcEmail}
        vrcName={vrcName}
        emailDestination={emailDestination}
        adminEmails={adminEmails}
      />

      <div>
        <StatusBadge status="UNASSIGNED" />
        <h2 className="mt-3 font-serif text-xl text-primary-dark">Assign therapist</h2>
        <p className="mt-1 text-sm text-muted">
          This client came from the referral form and needs a therapist assignment.
        </p>
        {rejectionReason && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Previous therapist declined: {rejectionReason}
          </p>
        )}
      </div>

      <form action={assignClientTherapistAction} className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="min-w-[220px] flex-1">
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

      <form action={adminRejectReferralAction} className="space-y-3 border-t border-border pt-6">
        <input type="hidden" name="clientId" value={clientId} />
        <label htmlFor="rejectReason" className={portalLabelClass}>
          Reject referral (optional note)
        </label>
        <textarea
          id="rejectReason"
          name="reason"
          rows={2}
          className={portalInputClass}
          placeholder="Reason for rejecting this referral…"
        />
        <button type="submit" className={portalButtonSecondaryClass}>
          Reject referral
        </button>
      </form>
    </div>
  );
}
