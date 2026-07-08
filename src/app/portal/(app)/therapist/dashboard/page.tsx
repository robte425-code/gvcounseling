import Link from "next/link";
import { requireTherapist } from "@/auth";
import { TherapistDashboardPaycheckTile } from "@/components/portal/TherapistDashboardPaycheckTile";
import { TherapistDashboardStatCard } from "@/components/portal/TherapistDashboardStatCard";
import { portalButtonClass, portalCardClass, portalSectionHeadingClass, StatusBadge } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { loadPaycheckSummaries } from "@/lib/paychecks";
import { prisma } from "@/lib/prisma";

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export default async function TherapistDashboardPage() {
  const session = await requireTherapist();
  const therapistId = session.user.id;
  const today = startOfUtcDay();

  const [
    clientCount,
    nextPayPeriod,
    draftCount,
    submittedCount,
    billedCount,
    submittedAggregate,
    pendingReferrals,
    recent,
    paychecks,
  ] = await Promise.all([
    prisma.client.count({
      where: { therapistId, assignmentStatus: "ACTIVE" },
    }),
    prisma.payPeriod.findFirst({
      where: { cutoffDate: { gte: today } },
      orderBy: { cutoffDate: "asc" },
      select: { cutoffDate: true, paymentDate: true, label: true },
    }),
    prisma.invoice.count({ where: { therapistId, status: "DRAFT" } }),
    prisma.invoice.count({ where: { therapistId, status: "SUBMITTED" } }),
    prisma.invoice.count({ where: { therapistId, status: "BILLED" } }),
    prisma.invoice.aggregate({
      where: { therapistId, status: "SUBMITTED" },
      _sum: { totalAmount: true },
    }),
    prisma.client.findMany({
      where: { therapistId, assignmentStatus: "PENDING_THERAPIST" },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.invoice.findMany({
      where: { therapistId },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { client: true },
    }),
    loadPaycheckSummaries({ therapistId }),
  ]);

  const currentPaycheck = paychecks[0] ?? null;
  const submittedTotal = Number(submittedAggregate._sum.totalAmount ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Dashboard</h1>
        <p className="mt-2 text-sm text-muted">Welcome back, {session.user.firstName}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TherapistDashboardStatCard
          href="/portal/therapist/clients"
          label="Active clients"
          value={clientCount}
        />
        <TherapistDashboardStatCard
          href="/portal/therapist/invoices?status=DRAFT"
          label="Draft invoices"
          value={draftCount}
        />
        <TherapistDashboardStatCard
          href="/portal/therapist/invoices?status=SUBMITTED"
          label="Submitted"
          value={submittedCount}
          hint={submittedCount > 0 ? "Awaiting admin billing" : undefined}
        />
        <TherapistDashboardStatCard
          href="/portal/therapist/invoices?status=BILLED"
          label="Billed"
          value={billedCount}
          hint={billedCount > 0 ? "With L&I" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TherapistDashboardPaycheckTile paycheck={currentPaycheck} />
        </div>
        <section className={portalCardClass}>
          <p className={portalSectionHeadingClass}>Upcoming pay period</p>
          {nextPayPeriod ? (
            <>
              <p className="mt-2 font-serif text-xl font-semibold text-primary-dark">
                {nextPayPeriod.label ?? formatDate(nextPayPeriod.cutoffDate)}
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Billing cutoff</dt>
                  <dd className="font-medium text-foreground">
                    {formatDate(nextPayPeriod.cutoffDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Expected L&I payment</dt>
                  <dd className="font-medium text-foreground">
                    {nextPayPeriod.paymentDate
                      ? formatDate(nextPayPeriod.paymentDate)
                      : "—"}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No upcoming pay periods scheduled.</p>
          )}
          {submittedCount > 0 && (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted">
              You have {submittedCount} submitted invoice{submittedCount === 1 ? "" : "s"}
              {submittedTotal > 0 ? ` (${formatCurrency(submittedTotal)} total)` : ""} in the
              billing queue.
            </p>
          )}
        </section>
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
              <li key={client.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-primary-dark">
                    {client.lastName}, {client.firstName}
                  </p>
                  <p className="font-mono text-xs text-muted">{client.lniClaimNumber}</p>
                </div>
                <Link
                  href={`/portal/therapist/referrals/${client.id}`}
                  className={portalButtonClass}
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={portalCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold text-primary-dark">Recent invoices</h2>
          <Link href="/portal/therapist/invoices" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {recent.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {recent.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link
                  href={`/portal/therapist/invoices/${inv.id}`}
                  className="font-medium text-primary-dark hover:underline"
                >
                  #{inv.invoiceNumber} · {inv.client.lastName}, {inv.client.firstName}
                </Link>
                <div className="flex items-center gap-3">
                  <StatusBadge status={inv.status} />
                  <span className="text-sm tabular-nums text-muted">
                    {formatCurrency(Number(inv.totalAmount))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No invoices yet.</p>
        )}
      </section>
    </div>
  );
}
