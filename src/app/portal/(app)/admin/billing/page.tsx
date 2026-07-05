import Link from "next/link";
import { requireAdmin } from "@/auth";
import { BillingPayPeriodsTable } from "@/components/portal/BillingPayPeriodsTable";
import {
  createPayPeriodAction,
  syncPayPeriodsFromLniAction,
} from "@/lib/portal-actions";
import { LNI_PAYMENT_STATUS_URL } from "@/lib/lni-pay-periods";
import { getIsaUsageIndicator } from "@/lib/edi837";
import { getVrcEmailRedirectTo } from "@/lib/vrc-billing-emails";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { LniFeesSection } from "@/components/portal/LniFeesSection";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    synced?: string;
    created?: string;
    updated?: string;
    total?: string;
    vrcEmailed?: string;
    sent?: string;
    vrcSkipped?: string;
    vrcErrors?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const periods = await prisma.payPeriod.findMany({
    where: { invoices: { some: {} } },
    orderBy: { cutoffDate: "desc" },
    include: {
      _count: {
        select: {
          invoices: true,
        },
      },
    },
  });

  const billedByPeriod = await prisma.invoice.groupBy({
    by: ["payPeriodId"],
    where: {
      payPeriodId: { not: null },
      status: "BILLED",
    },
    _count: true,
  });
  const billedCountByPeriodId = new Map(
    billedByPeriod.map((row) => [row.payPeriodId!, row._count]),
  );

  const periodRows = periods.map((period) => ({
    id: period.id,
    label: period.label,
    cutoffLabel: formatDate(period.cutoffDate),
    paymentLabel: formatDate(period.paymentDate),
    periodLabel: period.label ?? formatDate(period.cutoffDate),
    assignedInvoices: period._count.invoices,
    billedInvoices: billedCountByPeriodId.get(period.id) ?? 0,
  }));

  const totalAssigned = periodRows.reduce((sum, row) => sum + row.assignedInvoices, 0);

  const syncMessage =
    params.synced === "1"
      ? `Synced ${params.total ?? "0"} pay periods from L&I (${params.created ?? "0"} new, ${params.updated ?? "0"} updated).`
      : null;

  const vrcEmailMessage =
    params.vrcEmailed === "1"
      ? `Emailed ${params.sent ?? "0"} VRC${params.sent === "1" ? "" : "s"}.`
      : null;
  const vrcSkipped = params.vrcSkipped?.split(";;").filter(Boolean) ?? [];
  const vrcErrors = params.vrcErrors?.split(";;").filter(Boolean) ?? [];
  const vrcEmailRedirectTo = getVrcEmailRedirectTo();

  const hasAlerts = Boolean(syncMessage || vrcEmailMessage || vrcSkipped.length || vrcErrors.length);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">Billing</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Sync pay periods, generate 837 files for L&I upload, and notify VRCs when sessions are billed.
            Generated files download immediately and are not stored.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className={`${portalCardClass} min-w-[7rem] px-4 py-3 shadow-none`}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Pay periods</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-primary-dark">
              {periodRows.length}
            </p>
          </div>
          <div className={`${portalCardClass} min-w-[7rem] px-4 py-3 shadow-none`}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Assigned</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-primary-dark">
              {totalAssigned}
            </p>
          </div>
        </div>
      </div>

      {hasAlerts && (
        <div className="space-y-2">
          {syncMessage && (
            <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
              {syncMessage}
            </p>
          )}
          {vrcEmailMessage && (
            <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
              {vrcEmailMessage}
            </p>
          )}
          {vrcSkipped.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
              Skipped: {vrcSkipped.join(" ")}
            </p>
          )}
          {vrcErrors.length > 0 && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
              Errors: {vrcErrors.join(" ")}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className={`${portalCardClass} lg:col-span-4`}>
          <p className={portalSectionHeadingClass}>Setup</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">Pay periods</h2>
          <p className="mt-1 text-xs text-muted">
            Bill Cutoff maps to cutoff date; Warrant Date maps to expected payment.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <form action={syncPayPeriodsFromLniAction}>
              <button type="submit" className={`${portalButtonClass} w-full`}>
                Sync from L&I
              </button>
            </form>
            <a
              href={LNI_PAYMENT_STATUS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${portalButtonSecondaryClass} w-full text-center`}
            >
              View on LNI.wa.gov
            </a>
            <Link
              href="/portal/admin/invoices?status=SUBMITTED"
              className={`${portalButtonSecondaryClass} w-full text-center`}
            >
              Assign invoices
            </Link>
          </div>

          <form action={createPayPeriodAction} className="mt-6 space-y-3 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Add manually</p>
            <div>
              <label htmlFor="label" className={portalLabelCompactClass}>
                Label
              </label>
              <input
                id="label"
                name="label"
                className={portalInputCompactClass}
                placeholder="June 2026"
              />
            </div>
            <div>
              <label htmlFor="cutoffDate" className={portalLabelCompactClass}>
                Cutoff date
              </label>
              <input
                id="cutoffDate"
                name="cutoffDate"
                type="date"
                required
                className={portalInputCompactClass}
              />
            </div>
            <div>
              <label htmlFor="paymentDate" className={portalLabelCompactClass}>
                Expected payment
              </label>
              <input
                id="paymentDate"
                name="paymentDate"
                type="date"
                className={portalInputCompactClass}
              />
            </div>
            <button type="submit" className={`${portalButtonSecondaryClass} w-full`}>
              Add pay period
            </button>
          </form>
        </section>

        <section className={`${portalCardClass} lg:col-span-8`}>
          <p className={portalSectionHeadingClass}>837 & VRC</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
            Generate & notify
          </h2>
          <p className="mt-1 text-xs text-muted">
            Only pay periods with assigned invoices appear here. Choose Test or Production before
            generating.
          </p>
          {vrcEmailRedirectTo && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
              <strong>VRC email test mode:</strong> all Email VRC messages are sent to{" "}
              {vrcEmailRedirectTo} instead of each VRC&apos;s address. Remove{" "}
              <code className="rounded bg-amber-100 px-1">VRC_EMAIL_REDIRECT_TO</code> from Vercel
              env to send to VRCs.
            </p>
          )}

          <div className="mt-5">
            <BillingPayPeriodsTable
              rows={periodRows}
              defaultUsageIndicator={getIsaUsageIndicator()}
            />
          </div>
        </section>
      </div>

      <section>
        <LniFeesSection />
      </section>
    </div>
  );
}
