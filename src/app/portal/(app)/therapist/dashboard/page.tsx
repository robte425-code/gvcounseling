import Link from "next/link";
import { requireTherapist } from "@/auth";
import { portalButtonClass, portalCardClass, StatusBadge } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export default async function TherapistDashboardPage() {
  const session = await requireTherapist();
  const today = startOfUtcDay();
  const [clientCount, nextPayPeriod, draftCount, submittedCount, pendingReferrals, recent] =
    await Promise.all([
      prisma.client.count({
        where: { therapistId: session.user.id, assignmentStatus: "ACTIVE" },
      }),
      prisma.payPeriod.findFirst({
        where: { cutoffDate: { gte: today } },
        orderBy: { cutoffDate: "asc" },
      }),
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
    ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Dashboard</h1>
        <p className="mt-2 text-muted">Welcome, {session.user.firstName}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Assigned clients</p>
          <p className="mt-2 text-3xl font-semibold">{clientCount}</p>
        </div>
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Next cutoff date</p>
          <p className="mt-2 text-3xl font-semibold">
            {nextPayPeriod ? formatDate(nextPayPeriod.cutoffDate) : "—"}
          </p>
        </div>
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
