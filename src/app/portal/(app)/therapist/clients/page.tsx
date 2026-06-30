import Link from "next/link";
import { requireTherapist } from "@/auth";
import { ClientTableRow } from "@/components/portal/ClientTableRow";
import { StatusBadge, portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function TherapistClientsPage() {
  const session = await requireTherapist();
  const clients = await prisma.client.findMany({
    where: { therapistId: session.user.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">My clients</h1>
          <p className="mt-2 text-muted">Clients assigned to you.</p>
        </div>
        <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
          New invoice
        </Link>
      </div>

      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Claim #</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
                <ClientTableRow key={c.id} clientId={c.id} basePath="/portal/therapist/clients">
                  <td className="py-3 pr-4 font-mono text-xs">{c.lniClaimNumber}</td>
                  <td className="py-3 pr-4">
                    {c.lastName}, {c.firstName}
                  </td>
                  <td className="py-3 pr-4">
                    {c.assignmentStatus === "ACTIVE" ? (
                      <span className="text-xs text-muted">Active</span>
                    ) : (
                      <StatusBadge status={c.assignmentStatus} />
                    )}
                  </td>
                </ClientTableRow>
            ))}
          </tbody>
        </table>
        {clients.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No clients assigned to you yet.</p>
        )}
      </div>
    </div>
  );
}
