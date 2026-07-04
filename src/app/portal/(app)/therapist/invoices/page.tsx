import Link from "next/link";
import { requireTherapist } from "@/auth";
import {
  TherapistInvoicesTable,
  type TherapistInvoiceRow,
} from "@/components/portal/TherapistInvoicesTable";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import {
  earliestServiceDateIso,
  formatInvoiceServiceDates,
  payPeriodLabel,
  payPeriodSortKey,
} from "@/lib/invoice-pay-period-grouping";
import { prisma } from "@/lib/prisma";

export default async function TherapistInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireTherapist();
  const { status } = await searchParams;

  const invoices = await prisma.invoice.findMany({
    where: {
      therapistId: session.user.id,
      ...(status ? { status: status as "DRAFT" | "SUBMITTED" | "BILLED" } : {}),
    },
    include: {
      client: true,
      lineItems: { select: { serviceDate: true }, orderBy: { sortOrder: "asc" } },
      payPeriod: { select: { label: true, cutoffDate: true } },
      bill: { select: { payPeriod: { select: { label: true, cutoffDate: true } } } },
    },
  });

  const invoiceRows: TherapistInvoiceRow[] = invoices.map((inv) => {
    const period = inv.payPeriod ?? inv.bill?.payPeriod ?? null;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      paymentStatus: inv.paymentStatus,
      lniPaidAt: inv.lniPaidAt?.toISOString() ?? null,
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Invoices</h1>
        <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
          New invoice
        </Link>
      </div>
      <div className={portalCardClass}>
        <TherapistInvoicesTable invoices={invoiceRows} />
      </div>
    </div>
  );
}
