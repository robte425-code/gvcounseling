import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTherapist } from "@/auth";
import { ClientDetailView } from "@/components/portal/ClientDetailView";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function TherapistClientDetailPage({
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/portal/therapist/clients" className={`${portalButtonSecondaryClass} text-xs`}>
            ← Back to clients
          </Link>
          <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">
            {client.lastName}, {client.firstName}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted">{client.lniClaimNumber}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {client.assignmentStatus === "PENDING_THERAPIST" && (
            <Link href={`/portal/therapist/referrals/${client.id}`} className={portalButtonClass}>
              Review referral
            </Link>
          )}
          {client.assignmentStatus === "ACTIVE" && (
            <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
              New invoice
            </Link>
          )}
        </div>
      </div>

      <ClientDetailView client={client} />
    </div>
  );
}
