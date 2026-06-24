import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { ClientAssignmentPanel } from "@/components/portal/ClientAssignmentPanel";
import { portalButtonSecondaryClass } from "@/components/portal/ui";
import { ClientForm } from "../new/page";
import { deleteClientAction } from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/portal/admin/clients" className={`${portalButtonSecondaryClass} text-xs`}>
            ← Back to clients
          </Link>
          <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">
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
        {client.assignmentStatus === "ACTIVE" && (
          <form action={deleteClientAction}>
            <input type="hidden" name="id" value={client.id} />
            <button type="submit" className="text-sm text-red-700 hover:underline">
              Delete client
            </button>
          </form>
        )}
      </div>

      <ClientAssignmentPanel
        clientId={client.id}
        assignmentStatus={client.assignmentStatus}
        rejectionReason={client.rejectionReason}
        therapists={therapists}
      />

      <ClientForm client={client} />
    </div>
  );
}
