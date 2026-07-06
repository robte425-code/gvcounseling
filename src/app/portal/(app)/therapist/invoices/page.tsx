import Link from "next/link";
import { requireTherapist } from "@/auth";
import { TherapistInvoiceFilters } from "@/components/portal/TherapistInvoiceFilters";
import {
  TherapistInvoicesTable,
  type TherapistInvoiceRow,
} from "@/components/portal/TherapistInvoicesTable";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
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
  buildTherapistInvoicesHref,
  type TherapistInvoiceFilterValues,
} from "@/lib/invoice-list-filters";
import { prisma } from "@/lib/prisma";
import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";

const INVOICE_STATUSES = ["DRAFT", "SUBMITTED", "BILLED"] as const;

function isInvoiceStatus(value: string | undefined): value is InvoiceStatus {
  return INVOICE_STATUSES.includes(value as InvoiceStatus);
}

function parseInvoiceFilters(searchParams: {
  status?: string;
  payPeriodId?: string;
  paymentStatus?: string;
}): TherapistInvoiceFilterValues {
  return {
    status: isInvoiceStatus(searchParams.status) ? searchParams.status : undefined,
    payPeriodId: searchParams.payPeriodId?.trim() || undefined,
    paymentStatus: isInvoicePaymentFilter(searchParams.paymentStatus)
      ? searchParams.paymentStatus
      : undefined,
  };
}

function buildInvoiceWhere(
  therapistId: string,
  filters: TherapistInvoiceFilterValues,
): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { therapistId };

  if (filters.status) {
    where.status = filters.status;
  }

  return mergeInvoiceWhere(
    mergeInvoiceWhere(where, invoicePayPeriodWhere(filters.payPeriodId)),
    invoicePaymentWhere(filters.paymentStatus),
  );
}

export default async function TherapistInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; payPeriodId?: string; paymentStatus?: string }>;
}) {
  const session = await requireTherapist();
  const params = await searchParams;
  const filters = parseInvoiceFilters(params);

  const [invoices, payPeriods] = await Promise.all([
    prisma.invoice.findMany({
      where: buildInvoiceWhere(session.user.id, filters),
      include: {
        client: true,
        lineItems: { select: { serviceDate: true }, orderBy: { sortOrder: "asc" } },
        payPeriod: { select: { label: true, cutoffDate: true } },
      },
    }),
    prisma.payPeriod.findMany({
      orderBy: { cutoffDate: "desc" },
      select: { id: true, label: true, cutoffDate: true },
    }),
  ]);

  const invoiceRows: TherapistInvoiceRow[] = invoices.map((inv) => {
    const period = inv.payPeriod;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      paymentStatus: inv.paymentStatus,
      lniPaidAt: inv.lniPaidAt?.toISOString() ?? null,
      lniEobCodes: inv.lniEobCodes,
      lniEobCodeDescriptions: inv.lniEobCodeDescriptions,
      clientLabel: `${inv.client.lastName}, ${inv.client.firstName}`,
      serviceDates: formatInvoiceServiceDates(inv.lineItems),
      totalAmount: Number(inv.totalAmount),
      updatedAt: inv.updatedAt.toISOString(),
      payPeriodId: inv.payPeriodId,
      payPeriodLabel: payPeriodLabel(period),
      payPeriodSortKey: payPeriodSortKey(period),
      earliestServiceDate: earliestServiceDateIso(inv.lineItems),
    };
  });

  const periodOptions = payPeriods.map((period) => ({
    id: period.id,
    label: period.label ?? `Cutoff ${formatDate(period.cutoffDate)}`,
  }));

  const invoicesReturnTo = buildTherapistInvoicesHref(filters);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Invoices</h1>
        <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
          New invoice
        </Link>
      </div>

      <TherapistInvoiceFilters
        payPeriods={periodOptions}
        values={filters}
        resultCount={invoiceRows.length}
      />

      <div className={portalCardClass}>
        <TherapistInvoicesTable
          invoices={invoiceRows}
          hasFilters={Boolean(filters.status || filters.payPeriodId || filters.paymentStatus)}
          invoicesReturnTo={invoicesReturnTo}
        />
      </div>
    </div>
  );
}
