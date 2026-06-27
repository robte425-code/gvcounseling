import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { ClientForm } from "@/components/portal/ClientForm";
import { portalButtonSecondaryClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function AdminClientEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const detailHref = `/portal/admin/clients/${client.id}`;

  return (
    <div className="space-y-4">
      <div>
        <Link href={detailHref} className={`${portalButtonSecondaryClass} text-xs`}>
          ← Back to client
        </Link>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-primary-dark">
          Edit {client.lastName}, {client.firstName}
        </h1>
        <p className="mt-1 font-mono text-sm text-muted">{client.lniClaimNumber}</p>
      </div>
      <ClientForm client={client} mode="admin-edit" cancelHref={detailHref} />
    </div>
  );
}
