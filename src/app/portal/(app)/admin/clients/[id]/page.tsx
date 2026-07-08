import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRealUserId, requireAdmin } from "@/auth";
import { AdminClientWorkflowPanel } from "@/components/portal/AdminClientWorkflowPanel";
import { ClientCloseButton } from "@/components/portal/ClientCloseButton";
import { ClientDeleteButton } from "@/components/portal/ClientDeleteButton";
import { ClientFaxLniButton } from "@/components/portal/ClientFaxLniButton";
import { ClientNotesSection } from "@/components/portal/ClientNotesSection";
import { ClientDetailView } from "@/components/portal/ClientDetailView";
import { ClientDriveResyncButton } from "@/components/portal/ClientDriveResyncButton";
import { ClientDriveFilesLoading } from "@/components/portal/ClientDriveFilesLoading";
import { ClientDriveFilesSection } from "@/components/portal/ClientDriveFilesSection";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";
import { getOutboundTestingSettings } from "@/lib/portal-settings";
import { canAdminCloseClient } from "@/lib/client-assignment-status";
import { prisma } from "@/lib/prisma";

export default async function AdminClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    reopened?: string;
    reactivated?: string;
    saved?: string;
    noted?: string;
    vrcAccepted?: string;
    vrcInfoRequested?: string;
    assigned?: string;
    closed?: string;
    rejected?: string;
    faxed?: string;
  }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const {
    reopened,
    saved,
    noted,
    vrcAccepted,
    vrcInfoRequested,
    assigned,
    reactivated,
    closed,
    rejected,
    faxed,
  } = await searchParams;
  const [client, therapists, invoiceCount, outboundEmailSettings] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: { therapist: { select: { firstName: true, lastName: true } } },
    }),
    prisma.user.findMany({
      where: { role: "THERAPIST", active: true },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.invoice.count({ where: { clientId: id } }),
    getOutboundTestingSettings(),
  ]);
  if (!client) notFound();

  return (
    <div className="space-y-4">
      {reopened === "1" || reactivated === "1" ? (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client reactivated.
        </p>
      ) : null}
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
      {vrcAccepted === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Referral acceptance email sent.
        </p>
      )}
      {vrcInfoRequested === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Information request email sent.
        </p>
      )}
      {assigned === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Therapist assigned and notified.
        </p>
      )}
      {closed === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client closed. Their Drive folder was moved to the therapist&apos;s closed cases folder.
        </p>
      )}
      {rejected === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Referral rejected.
        </p>
      )}
      {faxed === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Documents uploaded to Drive and faxed to L&amp;I.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/portal/admin/clients" className={`${portalButtonSecondaryClass} text-xs`}>
            ← Back to clients
          </Link>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">
            {client.lastName}, {client.firstName}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted">{client.lniClaimNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/portal/admin/clients/${client.id}/edit`} className={portalButtonClass}>
            Edit client
          </Link>
          <ClientFaxLniButton
            clientId={client.id}
            clientLabel={`${client.lastName}, ${client.firstName}`}
            claimNumber={client.lniClaimNumber}
            returnTo={`/portal/admin/clients/${client.id}`}
            hasDriveFolder={Boolean(client.driveFolderId)}
            lniFaxRoute={outboundEmailSettings.lniFaxRoute}
          />
          {canAdminCloseClient(client.assignmentStatus) && (
            <ClientCloseButton
              clientId={client.id}
              clientLabel={`${client.lastName}, ${client.firstName}`}
              returnTo={`/portal/admin/clients/${client.id}`}
            />
          )}
          <ClientDeleteButton
            clientId={client.id}
            clientLabel={`${client.lastName}, ${client.firstName}`}
            returnTo="/portal/admin/clients"
            disabled={invoiceCount > 0}
          />
        </div>
      </div>

      <AdminClientWorkflowPanel
        clientId={client.id}
        clientLabel={`${client.lastName}, ${client.firstName}`}
        assignmentStatus={client.assignmentStatus}
        rejectionReason={client.rejectionReason}
        therapistName={
          client.therapist
            ? `${client.therapist.firstName} ${client.therapist.lastName}`
            : null
        }
        therapists={therapists}
        vrcEmail={client.vrcEmail}
        vrcName={client.vrcName}
        vrcRoute={outboundEmailSettings.vrcRoute}
        adminEmails={outboundEmailSettings.adminEmails}
        returnTo={`/portal/admin/clients/${client.id}`}
      />

      <ClientDetailView client={client} clientId={client.id} />
      <ClientDriveResyncButton clientId={client.id} />
      <Suspense fallback={<ClientDriveFilesLoading />}>
        <ClientDriveFilesSection
          driveFolderId={client.driveFolderId}
          therapistId={client.therapistId}
          initiatorUserId={getRealUserId(session)}
        />
      </Suspense>
      <ClientNotesSection
        clientId={client.id}
        returnTo={`/portal/admin/clients/${client.id}`}
      />
    </div>
  );
}
