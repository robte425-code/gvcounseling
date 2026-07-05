import { requireAdmin } from "@/auth";
import {
  AdminInvoiceFilters,
  buildAdminInvoicesHref,
  type AdminInvoiceFilterValues,
} from "@/components/portal/AdminInvoiceFilters";
import {
  AdminInvoicesTable,
  type AdminInvoiceRow,
  type PayPeriodOption,
} from "@/components/portal/AdminInvoicesTable";
import { portalCardClass } from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import {
  earliestServiceDateIso,
  formatInvoiceServiceDates,
  payPeriodLabel,
  payPeriodSortKey,
} from "@/lib/invoice-pay-period-grouping";
import {
  invoicePayPeriodWhere,
  invoicePaymentWhere,
  isInvoicePaymentFilter,
  mergeInvoiceWhere,
} from "@/lib/invoice-list-filters";
import { prisma } from "@/lib/prisma";
import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";

const INVOICE_STATUSES = ["DRAFT", "SUBMITTED", "BILLED"] as const;

function isInvoiceStatus(value: string | undefined): value is InvoiceStatus {
  return INVOICE_STATUSES.includes(value as InvoiceStatus);
}

function parseInvoiceFilters(searchParams: {
  status?: string;
  therapistId?: string;
  payPeriodId?: string;
  paymentStatus?: string;
  assigned?: string;
}): AdminInvoiceFilterValues {
  return {
    status: isInvoiceStatus(searchParams.status) ? searchParams.status : undefined,
    therapistId: searchParams.therapistId?.trim() || undefined,
    payPeriodId: searchParams.payPeriodId?.trim() || undefined,
    paymentStatus: isInvoicePaymentFilter(searchParams.paymentStatus)
      ? searchParams.paymentStatus
      : undefined,
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

  return mergeInvoiceWhere(
    mergeInvoiceWhere(where, invoicePayPeriodWhere(filters.payPeriodId)),
    invoicePaymentWhere(filters.paymentStatus),
  );
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    therapistId?: string;
    payPeriodId?: string;
    paymentStatus?: string;
    assigned?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filters = parseInvoiceFilters(params);
  const returnTo = buildAdminInvoicesHref(filters);

  const [invoices, payPeriods, therapists] = await Promise.all([
    prisma.invoice.findMany({
      where: buildInvoiceWhere(filters),
      include: {
        client: true,
        therapist: { select: { firstName: true, lastName: true } },
        lineItems: { select: { serviceDate: true }, orderBy: { sortOrder: "asc" } },
        payPeriod: { select: { label: true, cutoffDate: true } },
        bill: { select: { payPeriod: { select: { label: true, cutoffDate: true } } } },
      },
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
  ]);

  const invoiceRows: AdminInvoiceRow[] = invoices.map((inv) => {
    const period = inv.payPeriod ?? inv.bill?.payPeriod ?? null;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      paymentStatus: inv.paymentStatus,
      lniPaidAt: inv.lniPaidAt?.toISOString() ?? null,
      totalAmount: Number(inv.totalAmount),
      submittedAt: inv.submittedAt?.toISOString() ?? null,
      therapistName: `${inv.therapist.firstName} ${inv.therapist.lastName}`,
      clientLabel: `${inv.client.lastName}, ${inv.client.firstName} (${inv.client.lniClaimNumber})`,
      serviceDates: formatInvoiceServiceDates(inv.lineItems),
      payPeriodId: inv.payPeriodId,
      payPeriodLabel: payPeriodLabel(period),
      payPeriodSortKey: payPeriodSortKey(period),
      earliestServiceDate: earliestServiceDateIso(inv.lineItems),
      assignable: inv.status === "SUBMITTED" && !inv.billId,
    };
  });

  const periodOptions: PayPeriodOption[] = payPeriods.map((period) => ({
    id: period.id,
    label: period.label ?? `Cutoff ${formatDate(period.cutoffDate)}`,
  }));

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
          Select submitted invoices and assign them to a pay period before generating an 837 on the
          Billing page.
        </p>
      </div>

      <AdminInvoiceFilters
        therapists={therapists.map((therapist) => ({
          id: therapist.id,
          label: `${therapist.firstName} ${therapist.lastName}`,
        }))}
        payPeriods={periodOptions}
        values={filters}
        resultCount={invoiceRows.length}
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
