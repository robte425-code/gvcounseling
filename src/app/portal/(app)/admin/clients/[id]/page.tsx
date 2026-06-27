import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/auth";
import { ClientAssignmentPanel } from "@/components/portal/ClientAssignmentPanel";
import { ClientDetailView } from "@/components/portal/ClientDetailView";
import { ClientDriveFilesLoading } from "@/components/portal/ClientDriveFilesLoading";
import { ClientDriveFilesSection } from "@/components/portal/ClientDriveFilesSection";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";
import { deleteClientAction } from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

export default async function AdminClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reopened?: string; saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { reopened, saved } = await searchParams;
  const [client, therapists] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: { therapist: { select: { firstName: true, lastName: true } } },
    }),
    prisma.user.findMany({
      where: { role: "THERAPIST" },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  if (!client) notFound();

  return (
    <div className="space-y-4">
      {reopened === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client reopened successfully.
        </p>
      )}
      {saved === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client saved successfully.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/portal/admin/clients" className={`${portalButtonSecondaryClass} text-xs`}>
            ← Back to clients
          </Link>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-primary-dark">
            {client.lastName}, {client.firstName}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted">{client.lniClaimNumber}</p>
          <p className="mt-1 text-sm text-muted">
            Therapist:{" "}
            {client.therapist
              ? `${client.therapist.firstName} ${client.therapist.lastName}`
              : "Unassigned"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/portal/admin/clients/${client.id}/edit`} className={portalButtonClass}>
            Edit client
          </Link>
          {client.assignmentStatus === "ACTIVE" && (
            <form action={deleteClientAction}>
              <input type="hidden" name="id" value={client.id} />
              <button type="submit" className="text-sm text-red-700 hover:underline">
                Delete client
              </button>
            </form>
          )}
        </div>
      </div>

      <ClientAssignmentPanel
        clientId={client.id}
        assignmentStatus={client.assignmentStatus}
        rejectionReason={client.rejectionReason}
        therapists={therapists}
      />

      <ClientDetailView client={client} />
      <Suspense fallback={<ClientDriveFilesLoading />}>
        <ClientDriveFilesSection driveFolderId={client.driveFolderId} />
      </Suspense>
    </div>
  );
}
