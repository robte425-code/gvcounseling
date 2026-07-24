import Link from "next/link";
import { requireAdmin } from "@/auth";
import { AdminUnassignedClientsTile } from "@/components/portal/AdminUnassignedClientsTile";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

function formatDatabaseSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const pendingInvoiceWhere = {
    OR: [{ status: "DRAFT" as const }, { status: "SUBMITTED" as const, payPeriodId: null }],
  };

  const [
    submittedCount,
    draftCount,
    billedCount,
    unassignedClients,
    submittedTotal,
    pendingInvoices,
    databaseSizeRows,
  ] = await Promise.all([
    prisma.invoice.count({ where: { status: "SUBMITTED" } }),
    prisma.invoice.count({ where: { status: "DRAFT" } }),
    prisma.invoice.count({ where: { status: "BILLED" } }),
    prisma.client.findMany({
      where: { assignmentStatus: "UNASSIGNED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        lniClaimNumber: true,
        vrcName: true,
        createdAt: true,
      },
    }),
    prisma.invoice.aggregate({
      where: { status: "SUBMITTED" },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      where: pendingInvoiceWhere,
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ size_bytes: bigint }>>`
      SELECT pg_database_size(current_database()) AS size_bytes
    `,
  ]);

  const databaseSizeBytes = Number(databaseSizeRows[0]?.size_bytes ?? 0);
  const pendingInvoiceTotal = Number(pendingInvoices._sum.totalAmount ?? 0);
  const pendingInvoiceCount = pendingInvoices._count._all;
  const unassignedReferralCount = unassignedClients.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">Admin dashboard</h1>
        <p className="mt-2 text-muted">Manage billing, clients, and L&I invoices.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
        <Link
          href="/portal/admin/clients?status=UNASSIGNED"
          className={`${portalCardClass} transition hover:border-primary/40 hover:bg-primary/5 ${
            unassignedReferralCount > 0 ? "border-amber-200 bg-amber-50/40" : ""
          }`}
        >
          <p className="text-sm text-muted">New referrals to accept</p>
          <p className="mt-2 text-3xl font-semibold text-primary-dark">{unassignedReferralCount}</p>
          <p className="mt-1 text-sm text-muted">
            {unassignedReferralCount === 0
              ? "No unassigned referrals"
              : "Awaiting therapist assignment"}
          </p>
        </Link>
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
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Unassigned / unsubmitted</p>
          <p className="mt-2 text-3xl font-semibold text-primary-dark">
            {formatCurrency(pendingInvoiceTotal)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {pendingInvoiceCount} draft or unassigned invoice{pendingInvoiceCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Database size</p>
          <p className="mt-2 text-3xl font-semibold text-primary-dark">
            {formatDatabaseSize(databaseSizeBytes)}
          </p>
        </div>
      </div>

      <AdminUnassignedClientsTile clients={unassignedClients} />

      <div className="flex flex-wrap gap-3">
        <Link href="/portal/admin/billing" className={portalButtonClass}>
          Bill L&I
        </Link>
        <Link href="/portal/admin/pay" className={portalButtonClass}>
          Process RA
        </Link>
        <Link href="/portal/admin/clients/import" className={portalButtonClass}>
          Import clients
        </Link>
      </div>
    </div>
  );
}
