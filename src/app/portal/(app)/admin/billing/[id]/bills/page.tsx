import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { portalButtonSecondaryClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function PayPeriodBillsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const payPeriod = await prisma.payPeriod.findUnique({
    where: { id },
    select: { id: true, label: true, cutoffDate: true, paymentDate: true },
  });
  if (!payPeriod) notFound();

  const bills = await prisma.bill.findMany({
    where: { payPeriodId: id },
    orderBy: { generatedAt: "desc" },
    include: { generatedBy: { select: { firstName: true, lastName: true } } },
  });

  const periodLabel = payPeriod.label ?? formatDate(payPeriod.cutoffDate);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/admin/billing" className={`${portalButtonSecondaryClass} text-xs`}>
          ← Back to billing
        </Link>
        <h1 className="mt-3 font-serif text-3xl font-semibold text-primary-dark">
          Billing history
        </h1>
        <p className="mt-2 text-muted">
          {periodLabel} · cutoff {formatDate(payPeriod.cutoffDate)}
          {payPeriod.paymentDate ? ` · payment ${formatDate(payPeriod.paymentDate)}` : ""}
        </p>
      </div>

      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Generated</th>
              <th className="py-2 pr-4">File</th>
              <th className="py-2 pr-4">Claims</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">By</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id} className="border-b border-border/60 last:border-0">
                <td className="py-3 pr-4">{formatDate(bill.generatedAt)}</td>
                <td className="py-3 pr-4">{bill.filename}</td>
                <td className="py-3 pr-4">{bill.invoiceCount}</td>
                <td className="py-3 pr-4">{formatCurrency(Number(bill.totalAmount))}</td>
                <td className="py-3 pr-4 text-muted">
                  {bill.generatedBy.firstName} {bill.generatedBy.lastName}
                </td>
                <td className="py-3 text-right">
                  <Link
                    href={`/portal/admin/bills/${bill.id}`}
                    className={portalButtonSecondaryClass}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bills.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No 837 files generated for this pay period yet.
          </p>
        )}
      </div>
    </div>
  );
}
