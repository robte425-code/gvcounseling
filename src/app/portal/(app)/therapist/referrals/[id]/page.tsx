import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { requireTherapist } from "@/auth";
import { ClientDetailView } from "@/components/portal/ClientDetailView";
import { ClientDriveFilesLoading } from "@/components/portal/ClientDriveFilesLoading";
import { ClientDriveFilesSection } from "@/components/portal/ClientDriveFilesSection";
import { TherapistReferralReviewActions } from "@/components/portal/TherapistReferralReviewActions";
import { portalButtonSecondaryClass } from "@/components/portal/ui";
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
          clientId={client.id}
          claimNumber={client.lniClaimNumber}
        />
      </Suspense>

      <TherapistReferralReviewActions clientId={client.id} />
    </div>
  );
}
