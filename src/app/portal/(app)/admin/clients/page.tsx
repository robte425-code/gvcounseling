import Link from "next/link";
import { requireAdmin } from "@/auth";
import { ClientListFilters } from "@/components/portal/ClientListFilters";
import { ClientListFlashBanners } from "@/components/portal/ClientListFlashBanners";
import { ClientListHeader } from "@/components/portal/ClientListHeader";
import { ClientsTable } from "@/components/portal/ClientsTable";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";
import {
  buildClientListHref,
  clientListSearchWhere,
  normalizeClientSearchQuery,
} from "@/lib/client-list-search";
import type { ClientListRow, ClientStatusFilterOption } from "@/lib/client-list-ui";
import { ClientAssignmentStatus } from "@/generated/prisma/client";
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

function statusCountMap(
  rows: { assignmentStatus: ClientAssignmentStatus; _count: { _all: number } }[],
): Map<ClientAssignmentStatus, number> {
  return new Map(rows.map((row) => [row.assignmentStatus, row._count._all]));
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    closed?: string;
    reactivated?: string;
    deleted?: string;
  }>;
}) {
  await requireAdmin();
  const { status, q, closed, reactivated, deleted } = await searchParams;
  const statusFilter = isClientStatus(status) ? status : undefined;
  const query = normalizeClientSearchQuery(q);
  const searchWhere = clientListSearchWhere(query);

  const [clients, statusCounts, totalCount] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...(statusFilter ? { assignmentStatus: statusFilter } : {}),
        ...(searchWhere ?? {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        therapist: { select: { firstName: true, lastName: true } },
        _count: { select: { invoices: true } },
      },
    }),
    prisma.client.groupBy({
      by: ["assignmentStatus"],
      _count: { _all: true },
    }),
    prisma.client.count({
      where: searchWhere ?? {},
    }),
  ]);

  const counts = statusCountMap(statusCounts);
  const statusOptions: ClientStatusFilterOption[] = STATUS_FILTERS.map((filter) => ({
    label: filter.label,
    value: filter.value,
    count:
      filter.value === undefined
        ? totalCount
        : counts.get(filter.value as ClientAssignmentStatus) ?? 0,
    highlight: filter.value === "UNASSIGNED" && (counts.get("UNASSIGNED") ?? 0) > 0,
    active: filter.value === undefined ? !statusFilter : statusFilter === filter.value,
  }));

  const listReturnTo = buildClientListHref("/portal/admin/clients", {
    status: statusFilter,
    q: query || undefined,
  });

  const rows: ClientListRow[] = clients.map((client) => ({
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    lniClaimNumber: client.lniClaimNumber,
    assignmentStatus: client.assignmentStatus,
    therapistName: client.therapist
      ? `${client.therapist.firstName} ${client.therapist.lastName}`
      : null,
    invoiceCount: client._count.invoices,
  }));

  const emptyMessage = query
    ? `No clients match “${query}”.`
    : statusFilter
      ? "No clients match this status filter."
      : "No clients yet. Import or add one to get started.";

  return (
    <div className="space-y-6">
      <ClientListFlashBanners
        messages={[
          ...(closed === "1" ? [{ key: "closed", message: "Client closed." }] : []),
          ...(reactivated === "1" ? [{ key: "reactivated", message: "Client reactivated." }] : []),
          ...(deleted === "1" ? [{ key: "deleted", message: "Client deleted." }] : []),
        ]}
      />

      <ClientListHeader
        title="Clients"
        description="Manage the client registry, therapist assignments, and referral workflow for L&I billing."
        actions={
          <>
            <Link href="/portal/admin/clients/import" className={portalButtonSecondaryClass}>
              Import
            </Link>
            <Link href="/portal/admin/clients/new" className={portalButtonClass}>
              Add client
            </Link>
          </>
        }
      />

      <ClientListFilters
        basePath="/portal/admin/clients"
        query={query}
        status={statusFilter}
        statusOptions={statusOptions}
        resultCount={clients.length}
      />

      <ClientsTable
        clients={rows}
        basePath="/portal/admin/clients"
        listReturnTo={listReturnTo}
        variant="admin"
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
