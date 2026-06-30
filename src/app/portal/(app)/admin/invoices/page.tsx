import Link from "next/link";
import { requireAdmin } from "@/auth";
import {
  AdminInvoicesTable,
  type AdminInvoiceRow,
  type PayPeriodOption,
} from "@/components/portal/AdminInvoicesTable";
import { portalCardClass } from "@/components/portal/ui";
import { formatDate, formatCalendarIso, calendarIsoFromDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

function formatInvoiceServiceDates(lineItems: { serviceDate: Date }[]): string {
  const dates = [
    ...new Set(lineItems.map((line) => calendarIsoFromDate(line.serviceDate))),
  ].sort();
  if (dates.length === 0) return "—";
  return dates.map((date) => formatCalendarIso(date)).join(", ");
}

function payPeriodLabel(
  period: { label: string | null; cutoffDate: Date } | null,
): string | null {
  if (!period) return null;
  return period.label ?? formatDate(period.cutoffDate);
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assigned?: string }>;
}) {
  await requireAdmin();
  const { status, assigned } = await searchParams;
  const returnTo = status
    ? `/portal/admin/invoices?status=${encodeURIComponent(status)}`
    : "/portal/admin/invoices";

  const [invoices, payPeriods] = await Promise.all([
    prisma.invoice.findMany({
      where: status ? { status: status as "DRAFT" | "SUBMITTED" | "BILLED" } : undefined,
      orderBy: { updatedAt: "desc" },
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
  ]);

  const invoiceRows: AdminInvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    totalAmount: Number(inv.totalAmount),
    submittedAt: inv.submittedAt?.toISOString() ?? null,
    therapistName: `${inv.therapist.firstName} ${inv.therapist.lastName}`,
    clientLabel: `${inv.client.lastName}, ${inv.client.firstName} (${inv.client.lniClaimNumber})`,
    serviceDates: formatInvoiceServiceDates(inv.lineItems),
    payPeriodLabel:
      payPeriodLabel(inv.payPeriod) ?? payPeriodLabel(inv.bill?.payPeriod ?? null),
    assignable: inv.status === "SUBMITTED" && !inv.billId,
  }));

  const periodOptions: PayPeriodOption[] = payPeriods.map((period) => ({
    id: period.id,
    label: period.label ?? `Cutoff ${formatDate(period.cutoffDate)}`,
  }));

  const filters = [
    { label: "All", href: "/portal/admin/invoices" },
    { label: "Submitted", href: "/portal/admin/invoices?status=SUBMITTED" },
    { label: "Billed", href: "/portal/admin/invoices?status=BILLED" },
  ];

  const assignedCount = assigned ? Number.parseInt(assigned, 10) : 0;
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
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="rounded-full border border-border px-3 py-1 text-sm hover:bg-primary/10"
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

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
