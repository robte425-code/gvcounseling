import Link from "next/link";
import { requireTherapist } from "@/auth";
import { TherapistClientList } from "@/components/portal/TherapistClientList";
import { TherapistClientsOverview } from "@/components/portal/TherapistClientsOverview";
import { TherapistClientsSearchBar } from "@/components/portal/TherapistClientsSearchBar";
import { TherapistPendingReferralsBanner } from "@/components/portal/TherapistPendingReferralsBanner";
import { portalButtonClass, portalPageTitleClass } from "@/components/portal/ui";
import {
  buildClientListHref,
  clientListSearchWhere,
  normalizeClientSearchQuery,
} from "@/lib/client-list-search";
import type { ClientListRow } from "@/lib/client-list-ui";
import { ClientAssignmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const STATUS_FILTERS = [
  { label: "Active", value: undefined as string | undefined, statusKey: "ACTIVE" as const },
  { label: "All", value: "all", statusKey: null },
  { label: "Pending", value: "PENDING_THERAPIST", statusKey: "PENDING_THERAPIST" as const },
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
  const activeCount = counts.get("ACTIVE") ?? 0;
  const pendingCount = counts.get("PENDING_THERAPIST") ?? 0;
  const closedCount = counts.get("CLOSED") ?? 0;

  const overviewCards = STATUS_FILTERS.map((filter) => {
    const active =
      filter.value === "all"
        ? status === "all"
        : filter.value === undefined
          ? status === undefined || status === "ACTIVE"
          : statusFilter === filter.value;

    return {
      label: filter.label,
      count:
        filter.statusKey === null
          ? totalCount
          : counts.get(filter.statusKey) ?? 0,
      status: filter.value,
      active,
      highlight: filter.statusKey === "PENDING_THERAPIST" && pendingCount > 0,
      hint:
        filter.statusKey === "PENDING_THERAPIST" && pendingCount > 0
          ? "Needs review"
          : filter.statusKey === "ACTIVE"
            ? "Ready for billing"
            : undefined,
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
    ? `No clients match “${query}”. Try another name or claim number.`
    : statusFilter === "PENDING_THERAPIST"
      ? "No referrals are waiting for your review."
      : statusFilter === "CLOSED"
        ? "You have no closed clients."
        : statusFilter === "ACTIVE"
          ? "No active clients right now. Check pending referrals or view all clients."
          : "No clients assigned to you yet.";

  const showPendingBanner =
    pendingCount > 0 &&
    (statusFilter === "ACTIVE" || status === "all" || status === undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className={portalPageTitleClass}>My clients</h1>
          <p className="mt-2 text-sm text-muted">
            {activeCount} active · {pendingCount} pending · {closedCount} closed
          </p>
        </div>
        <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
          New invoice
        </Link>
      </div>

      <TherapistClientsOverview
        basePath="/portal/therapist/clients"
        query={query}
        cards={overviewCards}
      />

      {showPendingBanner ? (
        <TherapistPendingReferralsBanner
          basePath="/portal/therapist/clients"
          pendingCount={pendingCount}
          query={query}
        />
      ) : null}

      <TherapistClientsSearchBar
        basePath="/portal/therapist/clients"
        query={query}
        status={status === "all" ? "all" : statusFilter === "ACTIVE" && status === undefined ? undefined : statusFilter}
        resultCount={clients.length}
      />

      <TherapistClientList
        clients={rows}
        basePath="/portal/therapist/clients"
        listReturnTo={listReturnTo}
        emptyMessage={emptyMessage}
        pendingCount={pendingCount}
        query={query}
      />
    </div>
  );
}
