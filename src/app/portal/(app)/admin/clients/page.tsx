import Link from "next/link";
import { requireAdmin } from "@/auth";
import { ClientTableRow } from "@/components/portal/ClientTableRow";
import { StatusBadge, portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { client837Ready, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function AdminClientsPage() {
  await requireAdmin();
  const clients = await prisma.client.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { therapist: { select: { firstName: true, lastName: true } } },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">Clients</h1>
          <p className="mt-2 text-muted">Client registry for 837 billing.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/portal/admin/clients/import" className={portalButtonClass}>
            Import
          </Link>
          <Link href="/portal/admin/clients/new" className={portalButtonClass}>
            Add client
          </Link>
        </div>
      </div>

      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Claim #</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Therapist</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">837 ready</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const readiness = client837Ready(c);
              return (
                <ClientTableRow key={c.id} clientId={c.id}>
                  <td className="py-3 pr-4 font-mono text-xs">{c.lniClaimNumber}</td>
                  <td className="py-3 pr-4">
                    {c.lastName}, {c.firstName}
                  </td>
                  <td className="py-3 pr-4">
                    {c.therapist
                      ? `${c.therapist.firstName} ${c.therapist.lastName}`
                      : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {c.assignmentStatus === "ACTIVE" ? (
                      <span className="text-xs text-muted">Active</span>
                    ) : (
                      <StatusBadge status={c.assignmentStatus} />
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {readiness.ready ? (
                      <StatusBadge status="READY" />
                    ) : (
                      <span className="text-xs text-amber-800">{readiness.missing.join(", ")}</span>
                    )}
                  </td>
                </ClientTableRow>
              );
            })}
          </tbody>
        </table>
        {clients.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">No clients yet. Import or add one to get started.</p>
        )}
      </div>
    </div>
  );
}
