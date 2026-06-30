import Link from "next/link";
import { requireAdmin } from "@/auth";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { InvoiceTableRow } from "@/components/portal/InvoiceTableRow";
import { StatusBadge, portalButtonSecondaryClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate, formatCalendarIso, calendarIsoFromDate } from "@/lib/constants";
import { deleteAdminInvoiceAction } from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

function formatInvoiceServiceDates(lineItems: { serviceDate: Date }[]): string {
  const dates = [
    ...new Set(lineItems.map((line) => calendarIsoFromDate(line.serviceDate))),
  ].sort();
  if (dates.length === 0) return "—";
  return dates.map((date) => formatCalendarIso(date)).join(", ");
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const invoices = await prisma.invoice.findMany({
    where: status ? { status: status as "DRAFT" | "SUBMITTED" | "BILLED" } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      client: true,
      therapist: { select: { firstName: true, lastName: true } },
      lineItems: { select: { serviceDate: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  const filters = [
    { label: "All", href: "/portal/admin/invoices" },
    { label: "Submitted", href: "/portal/admin/invoices?status=SUBMITTED" },
    { label: "Billed", href: "/portal/admin/invoices?status=BILLED" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Invoices</h1>
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
      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Therapist</th>
              <th className="py-2 pr-4">Client</th>
              <th className="py-2 pr-4">Service date</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Submitted</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <InvoiceTableRow
                key={inv.id}
                href={`/portal/admin/invoices/${inv.id}`}
                actions={
                  <form action={deleteAdminInvoiceAction}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Delete invoice #${inv.invoiceNumber}?`}
                      className={`${portalButtonSecondaryClass} border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50`}
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                }
              >
                <td className="py-3 pr-4">{inv.invoiceNumber}</td>
                <td className="py-3 pr-4">
                  {inv.therapist.firstName} {inv.therapist.lastName}
                </td>
                <td className="py-3 pr-4">
                  {inv.client.lastName}, {inv.client.firstName} ({inv.client.lniClaimNumber})
                </td>
                <td className="py-3 pr-4">{formatInvoiceServiceDates(inv.lineItems)}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={inv.status} />
                </td>
                <td className="py-3 pr-4">{formatCurrency(Number(inv.totalAmount))}</td>
                <td className="py-3 pr-4">{formatDate(inv.submittedAt)}</td>
              </InvoiceTableRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
