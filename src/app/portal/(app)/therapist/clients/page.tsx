import Link from "next/link";
import { requireTherapist } from "@/auth";
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
  { label: "All", value: "all" },
  { label: "Active", value: "ACTIVE" },
  { label: "Pending review", value: "PENDING_THERAPIST" },
  { label: "Closed", value: "CLOSED" },
] as const;

type ClientStatus = Exclude<(typeof STATUS_FILTERS)[number]["value"], "all">;

function isClientStatus(value: string): value is ClientStatus {
  return STATUS_FILTERS.some((f) => f.value === value && f.value !== "all");
}

export default async function TherapistClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await requireTherapist();
  const { status, q } = await searchParams;
  const statusFilter: ClientStatus | undefined =
    status === "all"
      ? undefined
      : status === undefined
        ? "ACTIVE"
        : isClientStatus(status)
          ? status
          : "ACTIVE";
  const query = normalizeClientSearchQuery(q);
  const searchWhere = clientListSearchWhere(query);

  const clients = await prisma.client.findMany({
    where: {
      therapistId: session.user.id,
      ...(statusFilter ? { assignmentStatus: statusFilter } : {}),
      ...(searchWhere ?? {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">My clients</h1>
          <p className="mt-2 text-muted">Clients assigned to you.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => {
              const href = buildClientListHref("/portal/therapist/clients", {
                status: f.value === "ACTIVE" ? undefined : f.value,
                q: query || undefined,
              });
              const active =
                f.value === "all"
                  ? status === "all"
                  : f.value === "ACTIVE"
                    ? status === undefined || status === "ACTIVE"
                    : statusFilter === f.value;
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
        <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
          New invoice
        </Link>
      </div>

      <ClientListSearchForm
        basePath="/portal/therapist/clients"
        query={query}
        status={status}
      />

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
          <p className="py-8 text-center text-sm text-muted">
            {query
              ? `No clients match “${query}”.`
              : statusFilter
                ? "No clients match this status filter."
                : "No clients assigned to you yet."}
          </p>
        )}
      </div>
    </div>
  );
}
