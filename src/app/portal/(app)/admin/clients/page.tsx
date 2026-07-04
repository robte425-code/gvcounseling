import Link from "next/link";
import { requireAdmin } from "@/auth";
import { ClientListSearchForm } from "@/components/portal/ClientListSearchForm";
import { ClientTableRow } from "@/components/portal/ClientTableRow";
import { StatusBadge, portalButtonClass, portalCardClass } from "@/components/portal/ui";
import {
  buildClientListHref,
  clientListSearchWhere,
  normalizeClientSearchQuery,
} from "@/lib/client-list-search";
import { prisma } from "@/lib/prisma";

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Active", value: "ACTIVE" },
  { label: "Unassigned", value: "UNASSIGNED" },
  { label: "Pending therapist", value: "PENDING_THERAPIST" },
  { label: "Closed", value: "CLOSED" },
  { label: "Rejected", value: "REJECTED_BY_ADMIN" },
] as const;

type ClientStatus = (typeof STATUS_FILTERS)[number]["value"];

function isClientStatus(value: string | undefined): value is NonNullable<ClientStatus> {
  return STATUS_FILTERS.some((f) => f.value === value);
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdmin();
  const { status, q } = await searchParams;
  const statusFilter = isClientStatus(status) ? status : undefined;
  const query = normalizeClientSearchQuery(q);
  const searchWhere = clientListSearchWhere(query);

  const clients = await prisma.client.findMany({
    where: {
      ...(statusFilter ? { assignmentStatus: statusFilter } : {}),
      ...(searchWhere ?? {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { therapist: { select: { firstName: true, lastName: true } } },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">Clients</h1>
          <p className="mt-2 text-muted">Client registry for 837 billing.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => {
              const href = buildClientListHref("/portal/admin/clients", {
                status: f.value,
                q: query || undefined,
              });
              const active = statusFilter === f.value || (!statusFilter && !f.value);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    active
                      ? "border-primary bg-primary/10 text-primary-dark"
                      : "border-border hover:bg-primary/10"
                  }`}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
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

      <ClientListSearchForm
        basePath="/portal/admin/clients"
        query={query}
        status={statusFilter}
      />

      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Claim #</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Therapist</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
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
                </ClientTableRow>
            ))}
          </tbody>
        </table>
        {clients.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {query
              ? `No clients match “${query}”.`
              : statusFilter
                ? "No clients match this status filter."
                : "No clients yet. Import or add one to get started."}
          </p>
        )}
      </div>
    </div>
  );
}
