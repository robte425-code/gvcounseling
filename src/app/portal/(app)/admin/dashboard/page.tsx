import Link from "next/link";
import { requireAdmin } from "@/auth";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [submittedCount, draftCount, billedCount] = await Promise.all([
    prisma.invoice.count({ where: { status: "SUBMITTED" } }),
    prisma.invoice.count({ where: { status: "DRAFT" } }),
    prisma.invoice.count({ where: { status: "BILLED" } }),
  ]);

  const submittedTotal = await prisma.invoice.aggregate({
    where: { status: "SUBMITTED" },
    _sum: { totalAmount: true },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Admin dashboard</h1>
        <p className="mt-2 text-muted">Manage billing, clients, and L&I invoices.</p>
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
        <Link href="/portal/admin/billing" className={portalButtonClass}>
          Billing
        </Link>
        <Link href="/portal/admin/pay" className={portalButtonClass}>
          Pay
        </Link>
        <Link href="/portal/admin/clients/import" className={portalButtonClass}>
          Import clients
        </Link>
      </div>
    </div>
  );
}
