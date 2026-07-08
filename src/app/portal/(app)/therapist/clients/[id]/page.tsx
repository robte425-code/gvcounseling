import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireTherapist } from "@/auth";
import { ClientCloseButton } from "@/components/portal/ClientCloseButton";
import { ClientNotesSection } from "@/components/portal/ClientNotesSection";
import { ClientDetailView } from "@/components/portal/ClientDetailView";
import { ClientDriveFilesLoading } from "@/components/portal/ClientDriveFilesLoading";
import { ClientDriveFilesSection } from "@/components/portal/ClientDriveFilesSection";
import { ClientStatusActions } from "@/components/portal/ClientStatusActions";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function TherapistClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    noted?: string;
    closed?: string;
    reactivated?: string;
    rejected?: string;
  }>;
}) {
  const session = await requireTherapist();
  const { id } = await params;
  const { saved, noted, closed, reactivated, rejected } = await searchParams;

  const client = await prisma.client.findFirst({
    where: { id, therapistId: session.user.id },
  });
  if (!client) notFound();

  const clientDetailPath = `/portal/therapist/clients/${client.id}`;

  return (
    <div className="space-y-4">
      {saved === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client saved successfully.
        </p>
      )}
      {noted === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Note saved.
        </p>
      )}
      {closed === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client closed. Their Drive folder was moved to your closed cases folder.
        </p>
      )}
      {reactivated === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client reactivated.
        </p>
      )}
      {rejected === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Referral declined.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/portal/therapist/clients" className={`${portalButtonSecondaryClass} text-xs`}>
            ← Back to clients
          </Link>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-primary-dark">
            {client.lastName}, {client.firstName}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted">{client.lniClaimNumber}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/portal/therapist/clients/${client.id}/edit`} className={portalButtonClass}>
            Edit client
          </Link>
          {client.assignmentStatus === "ACTIVE" && (
            <ClientCloseButton
              clientId={client.id}
              clientLabel={`${client.lastName}, ${client.firstName}`}
              returnTo={clientDetailPath}
            />
          )}
          {client.assignmentStatus === "PENDING_THERAPIST" && (
            <Link href={`/portal/therapist/referrals/${client.id}`} className={portalButtonSecondaryClass}>
              Review referral
            </Link>
          )}
          {client.assignmentStatus === "ACTIVE" && (
            <Link
              href={`/portal/therapist/invoices/new?clientId=${client.id}`}
              className={portalButtonSecondaryClass}
            >
              New invoice
            </Link>
          )}
        </div>
      </div>

      <ClientStatusActions
        clientId={client.id}
        clientLabel={`${client.lastName}, ${client.firstName}`}
        assignmentStatus={client.assignmentStatus}
        rejectionReason={client.rejectionReason}
        role="therapist"
        returnTo={clientDetailPath}
      />

      <ClientDetailView client={client} clientId={client.id} />
      <Suspense fallback={<ClientDriveFilesLoading />}>
        <ClientDriveFilesSection
          driveFolderId={client.driveFolderId}
          therapistId={session.user.id}
          initiatorUserId={session.user.id}
        />
      </Suspense>
      <ClientNotesSection clientId={client.id} returnTo={clientDetailPath} />
    </div>
  );
}
