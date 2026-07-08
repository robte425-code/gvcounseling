import Link from "next/link";
import { requireTherapist } from "@/auth";
import { ClientListFilters } from "@/components/portal/ClientListFilters";
import { ClientListHeader } from "@/components/portal/ClientListHeader";
import { ClientsTable } from "@/components/portal/ClientsTable";
import { portalButtonClass } from "@/components/portal/ui";
import {
  buildClientListHref,
  clientListSearchWhere,
  normalizeClientSearchQuery,
} from "@/lib/client-list-search";
import type { ClientListRow, ClientStatusFilterOption } from "@/lib/client-list-ui";
import { ClientAssignmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const STATUS_FILTERS = [
  { label: "Active", value: undefined as string | undefined, statusKey: "ACTIVE" as const },
  { label: "All", value: "all", statusKey: null },
  { label: "Pending review", value: "PENDING_THERAPIST", statusKey: "PENDING_THERAPIST" as const },
  { label: "Closed", value: "CLOSED", statusKey: "CLOSED" as const },
] as const;

type ClientStatus = "ACTIVE" | "PENDING_THERAPIST" | "CLOSED";

function isClientStatus(value: string): value is ClientStatus {
  return value === "ACTIVE" || value === "PENDING_THERAPIST" || value === "CLOSED";
}

function statusCountMap(
  rows: { assignmentStatus: ClientAssignmentStatus; _count: { _all: number } }[],
): Map<ClientAssignmentStatus, number> {
  return new Map(rows.map((row) => [row.assignmentStatus, row._count._all]));
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
  const therapistWhere = { therapistId: session.user.id, ...(searchWhere ?? {}) };

  const [clients, statusCounts, totalCount] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...therapistWhere,
        ...(statusFilter ? { assignmentStatus: statusFilter } : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.client.groupBy({
      by: ["assignmentStatus"],
      where: { therapistId: session.user.id },
      _count: { _all: true },
    }),
    prisma.client.count({ where: therapistWhere }),
  ]);

  const counts = statusCountMap(statusCounts);
  const pendingCount = counts.get("PENDING_THERAPIST") ?? 0;

  const statusOptions: ClientStatusFilterOption[] = STATUS_FILTERS.map((filter) => {
    const active =
      filter.value === "all"
        ? status === "all"
        : filter.value === undefined
          ? status === undefined || status === "ACTIVE"
          : statusFilter === filter.value;

    return {
      label: filter.label,
      value: filter.value,
      count:
        filter.statusKey === null
          ? totalCount
          : counts.get(filter.statusKey) ?? 0,
      highlight: filter.statusKey === "PENDING_THERAPIST" && pendingCount > 0,
      active,
    };
  });

  const listReturnTo = buildClientListHref("/portal/therapist/clients", {
    status: status === "all" ? "all" : status === undefined ? undefined : statusFilter,
    q: query || undefined,
  });

  const rows: ClientListRow[] = clients.map((client) => ({
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    lniClaimNumber: client.lniClaimNumber,
    assignmentStatus: client.assignmentStatus,
  }));

  const emptyMessage = query
    ? `No clients match “${query}”.`
    : statusFilter
      ? "No clients match this status filter."
      : "No clients assigned to you yet.";

  return (
    <div className="space-y-6">
      <ClientListHeader
        title="My clients"
        description="Review assigned clients, respond to referrals, and start invoices from one place."
        actions={
          <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
            New invoice
          </Link>
        }
      />

      <ClientListFilters
        basePath="/portal/therapist/clients"
        query={query}
        status={status === "all" ? "all" : statusFilter === "ACTIVE" && status === undefined ? undefined : statusFilter}
        statusOptions={statusOptions}
        resultCount={clients.length}
      />

      <ClientsTable
        clients={rows}
        basePath="/portal/therapist/clients"
        listReturnTo={listReturnTo}
        variant="therapist"
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
