import Link from "next/link";
import { requireAdmin } from "@/auth";
import { AdminUnassignedClientsTile } from "@/components/portal/AdminUnassignedClientsTile";
import { VrcReferralEmailDestinationToggle } from "@/components/portal/VrcReferralEmailDestinationToggle";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import { getAdminNotificationEmails, getVrcReferralEmailDestination } from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [submittedCount, draftCount, billedCount, unassignedClients, vrcReferralEmailDestination, adminEmails] =
    await Promise.all([
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
    getVrcReferralEmailDestination(),
    getAdminNotificationEmails(),
  ]);

  const submittedTotal = await prisma.invoice.aggregate({
    where: { status: "SUBMITTED" },
    _sum: { totalAmount: true },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">Admin dashboard</h1>
        <p className="mt-2 text-muted">Manage billing, clients, and L&I invoices.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
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

      <VrcReferralEmailDestinationToggle
        destination={vrcReferralEmailDestination}
        adminEmails={adminEmails}
      />

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
