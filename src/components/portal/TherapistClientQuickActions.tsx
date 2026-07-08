"use client";

import Link from "next/link";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";
import { portalButtonSecondaryClass } from "@/components/portal/ui";

type Props = {
  clientId: string;
  assignmentStatus: ClientAssignmentStatus;
};

function stopRowNavigation(event: React.MouseEvent) {
  event.stopPropagation();
}

export function TherapistClientQuickActions({ clientId, assignmentStatus }: Props) {
  if (assignmentStatus === "ACTIVE") {
    return (
      <Link
        href={`/portal/therapist/invoices/new?clientId=${clientId}`}
        className={`${portalButtonSecondaryClass} px-3 py-1 text-xs`}
        onClick={stopRowNavigation}
      >
        New invoice
      </Link>
    );
  }

  if (assignmentStatus === "PENDING_THERAPIST") {
    return (
      <Link
        href={`/portal/therapist/referrals/${clientId}`}
        className={`${portalButtonSecondaryClass} px-3 py-1 text-xs`}
        onClick={stopRowNavigation}
      >
        Review referral
      </Link>
    );
  }

  return <span className="text-xs text-muted">—</span>;
}
