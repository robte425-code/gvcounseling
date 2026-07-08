import {
  assignClientTherapistAction,
} from "@/lib/portal-actions";
import { ClientVrcReferralActions } from "@/components/portal/ClientVrcReferralActions";
import { portalButtonClass, portalCardClass, portalInputClass, portalLabelClass, StatusBadge } from "@/components/portal/ui";
import type { OutboundEmailRoute } from "@/lib/portal-settings";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";

type TherapistOption = { id: string; firstName: string; lastName: string };

type ClientAssignmentPanelProps = {
  clientId: string;
  assignmentStatus: ClientAssignmentStatus;
  rejectionReason: string | null;
  therapists: TherapistOption[];
  vrcEmail: string | null;
  vrcName: string | null;
  vrcRoute: OutboundEmailRoute;
  adminEmails: string[];
};

export function ClientAssignmentPanel({
  clientId,
  assignmentStatus,
  rejectionReason,
  therapists,
  vrcEmail,
  vrcName,
  vrcRoute,
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
    return null;
  }

  if (assignmentStatus === "CLOSED") {
    return null;
  }

  return (
    <div className={`${portalCardClass} space-y-6 border-primary/20`}>
      <ClientVrcReferralActions
        clientId={clientId}
        vrcEmail={vrcEmail}
        vrcName={vrcName}
        vrcRoute={vrcRoute}
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
    </div>
  );
}
