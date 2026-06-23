import Link from "next/link";
import { requireAdmin } from "@/auth";
import { portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function BillsHistoryPage() {
  await requireAdmin();
  const bills = await prisma.bill.findMany({
    orderBy: { generatedAt: "desc" },
    include: { payPeriod: true, generatedBy: { select: { firstName: true, lastName: true } } },
  });

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl font-semibold text-primary-dark">Bill history</h1>
      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Generated</th>
              <th className="py-2 pr-4">File</th>
              <th className="py-2 pr-4">Cutoff</th>
              <th className="py-2 pr-4">Claims</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id} className="border-b border-border/60">
                <td className="py-3 pr-4">{formatDate(bill.generatedAt)}</td>
                <td className="py-3 pr-4">{bill.filename}</td>
                <td className="py-3 pr-4">{formatDate(bill.payPeriod.cutoffDate)}</td>
                <td className="py-3 pr-4">{bill.invoiceCount}</td>
                <td className="py-3 pr-4">{formatCurrency(Number(bill.totalAmount))}</td>
                <td className="py-3 text-right">
                  <Link href={`/portal/admin/bills/${bill.id}`} className="text-primary hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
