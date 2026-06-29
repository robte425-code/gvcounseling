import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { requireTherapist } from "@/auth";
import { ClientDetailView } from "@/components/portal/ClientDetailView";
import { ClientDriveFilesLoading } from "@/components/portal/ClientDriveFilesLoading";
import { ClientDriveFilesSection } from "@/components/portal/ClientDriveFilesSection";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";
import {
  therapistAcceptReferralAction,
  therapistRejectReferralAction,
} from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

export default async function TherapistReferralReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTherapist();
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, therapistId: session.user.id },
  });
  if (!client) notFound();

  if (client.assignmentStatus !== "PENDING_THERAPIST") {
    redirect("/portal/therapist/dashboard");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/portal/therapist/dashboard" className={`${portalButtonSecondaryClass} text-xs`}>
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">
          New client referral
        </h1>
        <p className="mt-2 text-muted">
          Review the client information and attached files below, then accept or decline this
          assignment.
        </p>
      </div>

      <ClientDetailView client={client} clientId={client.id} />

      <Suspense fallback={<ClientDriveFilesLoading />}>
        <ClientDriveFilesSection
          driveFolderId={client.driveFolderId}
          therapistId={session.user.id}
          initiatorUserId={session.user.id}
        />
      </Suspense>

      <div className={`${portalCardClass} space-y-4`}>
        <form action={therapistAcceptReferralAction}>
          <input type="hidden" name="clientId" value={client.id} />
          <button type="submit" className={portalButtonClass}>
            Accept client
          </button>
        </form>

        <form action={therapistRejectReferralAction} className="space-y-3 border-t border-border pt-4">
          <input type="hidden" name="clientId" value={client.id} />
          <label htmlFor="reason" className={portalLabelClass}>
            Decline reason <span className="text-primary">*</span>
          </label>
          <textarea
            id="reason"
            name="reason"
            required
            rows={3}
            className={portalInputClass}
            placeholder="Please explain why you are declining this referral…"
          />
          <button type="submit" className={portalButtonSecondaryClass}>
            Decline referral
          </button>
        </form>
      </div>
    </div>
  );
}
