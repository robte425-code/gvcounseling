"use client";

import { useState } from "react";
import {
  therapistAcceptReferralAction,
  therapistRejectReferralAction,
} from "@/lib/portal-actions";
import { ClientStatusReasonDialog } from "@/components/portal/ClientStatusReasonDialog";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
} from "@/components/portal/ui";

type Props = {
  clientId: string;
};

export function TherapistReferralReviewActions({ clientId }: Props) {
  const [declineOpen, setDeclineOpen] = useState(false);

  return (
    <>
      <div className={`${portalCardClass} space-y-4`}>
        <form action={therapistAcceptReferralAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <button type="submit" className={portalButtonClass}>
            Accept client
          </button>
        </form>

        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setDeclineOpen(true)}
            className={portalButtonSecondaryClass}
          >
            Decline referral
          </button>
        </div>
      </div>

      <ClientStatusReasonDialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline referral"
        description="Decline this referral? It will return to the unassigned queue for admin review."
        submitLabel="Decline referral"
        formAction={therapistRejectReferralAction}
        clientId={clientId}
        titleId="decline-referral-reason"
      />
    </>
  );
}
