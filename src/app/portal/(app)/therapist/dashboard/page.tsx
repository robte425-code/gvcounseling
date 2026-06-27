import Link from "next/link";
import { getRealUserId, requireTherapist } from "@/auth";
import { portalButtonClass, portalCardClass, StatusBadge } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function TherapistDashboardPage() {
  const session = await requireTherapist();
  const userId = getRealUserId(session);
  const [draftCount, submittedCount, pendingReferrals, recent, driveConnection] = await Promise.all([
    prisma.invoice.count({ where: { therapistId: session.user.id, status: "DRAFT" } }),
    prisma.invoice.count({ where: { therapistId: session.user.id, status: "SUBMITTED" } }),
    prisma.client.findMany({
      where: { therapistId: session.user.id, assignmentStatus: "PENDING_THERAPIST" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { therapistId: session.user.id },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { client: true },
    }),
    prisma.googleDriveConnection.findUnique({
      where: { userId },
      select: { id: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Dashboard</h1>
        <p className="mt-2 text-muted">Welcome, {session.user.firstName}.</p>
      </div>
      {!driveConnection && (
        <section className={`${portalCardClass} border-primary/20 bg-primary/5`}>
          <h2 className="font-serif text-lg font-semibold text-primary-dark">
            Connect Google Drive
          </h2>
          <p className="mt-2 text-sm text-muted">
            Link your Google account to view client files and folders on client detail pages.
          </p>
          <Link href="/portal/therapist/integrations" className={`${portalButtonClass} mt-4 inline-block`}>
            Go to Integrations
          </Link>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Draft invoices</p>
          <p className="mt-2 text-3xl font-semibold">{draftCount}</p>
        </div>
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Submitted (awaiting bill)</p>
          <p className="mt-2 text-3xl font-semibold">{submittedCount}</p>
        </div>
      </div>
      {pendingReferrals.length > 0 && (
        <section className={`${portalCardClass} border-amber-200 bg-amber-50/50`}>
          <h2 className="font-serif text-xl font-semibold text-primary-dark">
            Pending referrals ({pendingReferrals.length})
          </h2>
          <p className="mt-1 text-sm text-muted">
            Review and accept or decline new client assignments.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {pendingReferrals.map((client) => (
              <li key={client.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">
                    {client.lastName}, {client.firstName}
                  </p>
                  <p className="font-mono text-xs text-muted">{client.lniClaimNumber}</p>
                </div>
                <Link href={`/portal/therapist/referrals/${client.id}`} className={portalButtonClass}>
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
        New invoice
      </Link>
      <section className={portalCardClass}>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Recent invoices</h2>
        <ul className="mt-4 divide-y divide-border">
          {recent.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-3">
              <Link href={`/portal/therapist/invoices/${inv.id}`} className="hover:underline">
                #{inv.invoiceNumber} · {inv.client.lastName}, {inv.client.firstName}
              </Link>
              <div className="flex items-center gap-3">
                <StatusBadge status={inv.status} />
                <span className="text-sm">{formatCurrency(Number(inv.totalAmount))}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
