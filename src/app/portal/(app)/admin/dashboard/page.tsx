import Link from "next/link";
import { requireAdmin } from "@/auth";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [submittedCount, draftCount, billedCount, recentBills] = await Promise.all([
    prisma.invoice.count({ where: { status: "SUBMITTED" } }),
    prisma.invoice.count({ where: { status: "DRAFT" } }),
    prisma.invoice.count({ where: { status: "BILLED" } }),
    prisma.bill.findMany({
      take: 5,
      orderBy: { generatedAt: "desc" },
      include: { payPeriod: true },
    }),
  ]);

  const submittedTotal = await prisma.invoice.aggregate({
    where: { status: "SUBMITTED" },
    _sum: { totalAmount: true },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Admin dashboard</h1>
        <p className="mt-2 text-muted">Manage pay periods, clients, and L&I billing.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Submitted invoices</p>
          <p className="mt-2 text-3xl font-semibold text-primary-dark">{submittedCount}</p>
          <p className="mt-1 text-sm text-muted">
            {formatCurrency(Number(submittedTotal._sum.totalAmount ?? 0))} queued
          </p>
        </div>
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Draft invoices</p>
          <p className="mt-2 text-3xl font-semibold text-primary-dark">{draftCount}</p>
        </div>
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Billed (awaiting RA)</p>
          <p className="mt-2 text-3xl font-semibold text-primary-dark">{billedCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/portal/admin/generate-bill" className={portalButtonClass}>
          Generate L&I bill
        </Link>
        <Link href="/portal/admin/clients/import" className={portalButtonClass}>
          Import clients
        </Link>
      </div>

      <section className={portalCardClass}>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Recent bills</h2>
        {recentBills.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No bills generated yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {recentBills.map((bill) => (
              <li key={bill.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link
                    href={`/portal/admin/bills/${bill.id}`}
                    className="font-medium text-primary-dark hover:underline"
                  >
                    {bill.filename}
                  </Link>
                  <p className="text-sm text-muted">
                    Cutoff {formatDate(bill.payPeriod.cutoffDate)} · {bill.invoiceCount} claims ·{" "}
                    {formatCurrency(Number(bill.totalAmount))}
                  </p>
                </div>
                <span className="text-sm text-muted">{formatDate(bill.generatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
