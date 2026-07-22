import { requireAdmin } from "@/auth";
import { AdminInvoiceFilters } from "@/components/portal/AdminInvoiceFilters";
import {
  AdminInvoicesTable,
  type AdminInvoiceRow,
  type PayPeriodOption,
} from "@/components/portal/AdminInvoicesTable";
import { AdminUnassignedInvoicesTile } from "@/components/portal/AdminUnassignedInvoicesTile";
import { portalCardClass } from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import {
  earliestServiceDateIso,
  formatInvoiceServiceDates,
  payPeriodLabel,
  payPeriodSortKey,
  startOfUtcDay,
} from "@/lib/invoice-pay-period-grouping";
import {
  buildAdminInvoicesHref,
  invoiceNumberWhere,
  invoicePayPeriodWhere,
  invoicePaymentWhere,
  isInvoicePaymentFilter,
  mergeInvoiceWhere,
  type AdminInvoiceFilterValues,
  parseInvoiceNumberFilter,
} from "@/lib/invoice-list-filters";
import {
  invoiceTherapistPayRunLinesInclude,
  therapistPaymentFromPayRunLines,
} from "@/lib/invoice-therapist-payment";
import { prisma } from "@/lib/prisma";
import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";

const INVOICE_STATUSES = ["DRAFT", "SUBMITTED", "BILLED"] as const;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    client: true;
    therapist: { select: { firstName: true; lastName: true } };
    lineItems: { select: { serviceDate: true } };
    payPeriod: { select: { label: true; cutoffDate: true } };
    payRunLines: { select: { id: true; payout: { select: { payRun: { select: { status: true } } } } } };
  };
}>;

function isInvoiceStatus(value: string | undefined): value is InvoiceStatus {
  return INVOICE_STATUSES.includes(value as InvoiceStatus);
}

function parseInvoiceFilters(searchParams: {
  status?: string;
  therapistId?: string;
  payPeriodId?: string;
  paymentStatus?: string;
  invoiceNumber?: string;
  assigned?: string;
}): AdminInvoiceFilterValues {
  return {
    status: isInvoiceStatus(searchParams.status) ? searchParams.status : undefined,
    therapistId: searchParams.therapistId?.trim() || undefined,
    payPeriodId: searchParams.payPeriodId?.trim() || undefined,
    paymentStatus: isInvoicePaymentFilter(searchParams.paymentStatus)
      ? searchParams.paymentStatus
      : undefined,
    invoiceNumber: parseInvoiceNumberFilter(searchParams.invoiceNumber),
  };
}

function buildInvoiceWhere(filters: AdminInvoiceFilterValues): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.therapistId) {
    where.therapistId = filters.therapistId;
  }

  // Unassigned invoices belong only in the Needs pay period tile — never the main list.
  if (filters.payPeriodId === "none") {
    return { id: { in: [] } };
  }

  const periodWhere = filters.payPeriodId
    ? invoicePayPeriodWhere(filters.payPeriodId)
    : { payPeriodId: { not: null } };

  return mergeInvoiceWhere(
    mergeInvoiceWhere(
      mergeInvoiceWhere(where, periodWhere),
      invoicePaymentWhere(filters.paymentStatus),
    ),
    invoiceNumberWhere(filters.invoiceNumber),
  );
}

function buildUnassignedInvoiceWhere(filters: AdminInvoiceFilterValues): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {
    payPeriodId: null,
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.therapistId) {
    where.therapistId = filters.therapistId;
  }

  return mergeInvoiceWhere(
    mergeInvoiceWhere(where, invoicePaymentWhere(filters.paymentStatus)),
    invoiceNumberWhere(filters.invoiceNumber),
  );
}

function toAdminInvoiceRow(inv: InvoiceWithRelations): AdminInvoiceRow {
  const period = inv.payPeriod;
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    lniPaidAt: inv.lniPaidAt?.toISOString() ?? null,
    lniEobCodes: inv.lniEobCodes,
    lniEobCodeDescriptions: inv.lniEobCodeDescriptions,
    therapistPayment: therapistPaymentFromPayRunLines(inv.payRunLines),
    totalAmount: Number(inv.totalAmount),
    submittedAt: inv.submittedAt?.toISOString() ?? null,
    therapistName: `${inv.therapist.firstName} ${inv.therapist.lastName}`,
    clientLabel: `${inv.client.lastName}, ${inv.client.firstName} (${inv.client.lniClaimNumber})`,
    serviceDates: formatInvoiceServiceDates(inv.lineItems),
    payPeriodId: inv.payPeriodId,
    payPeriodLabel: payPeriodLabel(period),
    payPeriodSortKey: payPeriodSortKey(period),
    earliestServiceDate: earliestServiceDateIso(inv.lineItems),
    assignable: inv.status === "SUBMITTED",
  };
}

const invoiceInclude = {
  client: true,
  therapist: { select: { firstName: true, lastName: true } },
  lineItems: { select: { serviceDate: true }, orderBy: { sortOrder: "asc" as const } },
  payPeriod: { select: { label: true, cutoffDate: true } },
  ...invoiceTherapistPayRunLinesInclude,
};

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    therapistId?: string;
    payPeriodId?: string;
    paymentStatus?: string;
    invoiceNumber?: string;
    assigned?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filters = parseInvoiceFilters(params);
  const returnTo = buildAdminInvoicesHref(filters);
  const today = startOfUtcDay();

  const [invoices, unassignedInvoices, payPeriods, therapists, nextPayPeriod] = await Promise.all([
    prisma.invoice.findMany({
      where: buildInvoiceWhere(filters),
      include: invoiceInclude,
    }),
    prisma.invoice.findMany({
      where: buildUnassignedInvoiceWhere(filters),
      include: invoiceInclude,
    }),
    prisma.payPeriod.findMany({
      orderBy: { cutoffDate: "desc" },
      select: { id: true, label: true, cutoffDate: true },
    }),
    prisma.user.findMany({
      where: { role: "THERAPIST" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.payPeriod.findFirst({
      where: { cutoffDate: { gte: today } },
      orderBy: { cutoffDate: "asc" },
      select: { id: true },
    }),
  ]);

  const unassignedRows = unassignedInvoices.map(toAdminInvoiceRow);
  // Belt-and-suspenders: never list unassigned rows in the main table.
  const invoiceRows = invoices
    .map(toAdminInvoiceRow)
    .filter((row) => row.payPeriodId != null);

  const periodOptions: PayPeriodOption[] = payPeriods.map((period) => ({
    id: period.id,
    label: period.label ?? `Cutoff ${formatDate(period.cutoffDate)}`,
  }));

  const nextPayPeriodId = nextPayPeriod?.id ?? payPeriods[0]?.id ?? null;

  const assignedCount = params.assigned ? Number.parseInt(params.assigned, 10) : 0;
  const assignedMessage =
    assignedCount > 0
      ? `Updated pay period assignment for ${assignedCount} invoice${assignedCount === 1 ? "" : "s"}.`
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Invoices</h1>
        <p className="mt-2 text-sm text-muted">
          Unassigned invoices appear in Needs pay period above. Assign submitted ones to a pay
          period before generating an 837 on the Billing page.
        </p>
      </div>

      <AdminUnassignedInvoicesTile
        invoices={unassignedRows}
        payPeriods={periodOptions}
        nextPayPeriodId={nextPayPeriodId}
        returnTo={returnTo}
      />

      <AdminInvoiceFilters
        therapists={therapists.map((therapist) => ({
          id: therapist.id,
          label: `${therapist.firstName} ${therapist.lastName}`,
        }))}
        payPeriods={periodOptions}
        values={filters}
        resultCount={invoiceRows.length + unassignedRows.length}
      />

      {assignedMessage && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          {assignedMessage}
        </p>
      )}

      <div className={portalCardClass}>
        <AdminInvoicesTable
          invoices={invoiceRows}
          payPeriods={periodOptions}
          returnTo={returnTo}
        />
      </div>
    </div>
  );
}
