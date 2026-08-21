import Link from "next/link";
import { requireAdmin } from "@/auth";
import { BillingWorkspace } from "@/components/portal/BillingWorkspace";
import {
  createPayPeriodAction,
  syncPayPeriodsFromLniAction,
} from "@/lib/portal-actions";
import { LNI_PAYMENT_STATUS_URL } from "@/lib/lni-pay-periods";
import { getBillingIsaUsageIndicator, getOutboundTestingSettings } from "@/lib/portal-settings";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { formatCalendarDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { consumeNotifyBatchResult } from "@/lib/notify-batch-results";
import { BillingJumpNav } from "@/components/portal/BillingJumpNav";
import { LniFeesSection } from "@/components/portal/LniFeesSection";
import { Billing837SubmissionHistory } from "@/components/portal/Billing837SubmissionHistory";
import { Validate999AckPanel } from "@/components/portal/Validate999AckPanel";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    synced?: string;
    created?: string;
    updated?: string;
    total?: string;
    notifyResult?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const [periods, outboundEmailSettings, billingIsaUsageIndicator] = await Promise.all([
    prisma.payPeriod.findMany({
      where: { invoices: { some: {} } },
      orderBy: { cutoffDate: "desc" },
      include: {
        _count: {
          select: {
            invoices: true,
          },
        },
      },
    }),
    getOutboundTestingSettings(),
    getBillingIsaUsageIndicator(),
  ]);

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
    cutoffLabel: formatCalendarDate(period.cutoffDate),
    paymentLabel: formatCalendarDate(period.paymentDate),
    periodLabel: period.label ?? formatCalendarDate(period.cutoffDate),
    assignedInvoices: period._count.invoices,
    billedInvoices: billedCountByPeriodId.get(period.id) ?? 0,
  }));

  const totalAssigned = periodRows.reduce((sum, row) => sum + row.assignedInvoices, 0);

  const syncMessage =
    params.synced === "1"
      ? `Synced ${params.total ?? "0"} pay periods from L&I (${params.created ?? "0"} new, ${params.updated ?? "0"} updated).`
      : null;

  // Read once from the server-side store; the URL carries only an opaque id so
  // patient names and claim numbers stay out of logs and browser history.
  const notifyResult = await consumeNotifyBatchResult(params.notifyResult);

  const vrcEmailRan = notifyResult?.kind === "vrc";
  const vrcSentCount = vrcEmailRan ? String(notifyResult.sent) : "0";
  const vrcRecipients = vrcEmailRan ? notifyResult.recipients : [];
  const vrcMore = vrcEmailRan ? notifyResult.more : 0;
  const vrcAdminCc = vrcEmailRan ? notifyResult.adminCc.join(", ") : "";
  const vrcSkipped = vrcEmailRan ? notifyResult.skipped : [];
  const vrcErrors = vrcEmailRan ? notifyResult.errors : [];

  const lniFaxRan = notifyResult?.kind === "fax";
  const faxSentCount = lniFaxRan ? notifyResult.sent : 0;
  const lniFaxRecipients = lniFaxRan ? notifyResult.recipients : [];
  const lniFaxMore = lniFaxRan ? notifyResult.more : 0;
  const lniFaxSkipped = lniFaxRan ? notifyResult.skipped : [];
  const lniFaxErrors = lniFaxRan ? notifyResult.errors : [];

  const hasAlerts = Boolean(
    syncMessage ||
      vrcEmailRan ||
      lniFaxRan ||
      vrcSkipped.length ||
      vrcErrors.length ||
      lniFaxSkipped.length ||
      lniFaxErrors.length,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">Bill L&I</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Generate 837s, validate 999 acknowledgements, sync pay periods, and notify VRCs / L&I.
            Use the jump links to move between sections without scrolling the full period list.
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

      <BillingJumpNav />

      {hasAlerts && (
        <div id="notify-results" className="space-y-2 scroll-mt-24">
          {syncMessage && (
            <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
              {syncMessage}
            </p>
          )}
          {vrcEmailRan && (
            <div
              className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary-dark"
              role="status"
            >
              <p className="font-semibold">
                Email VRCs finished — {vrcSentCount} message
                {vrcSentCount === "1" ? "" : "s"} sent.
              </p>
              {vrcAdminCc ? (
                <p className="mt-1 text-xs text-muted">
                  Admin CC on each VRC email: {vrcAdminCc}. Full details are in the admin summary
                  email.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Full details are in the admin summary email. If outbound VRC mail is routed to
                  admin, those messages appear in the admin inbox as the To recipient (no separate
                  CC).
                </p>
              )}
              {vrcRecipients.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-primary-dark/90">
                  {vrcRecipients.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                  {vrcMore > 0 ? (
                    <li>…and {vrcMore} more (see summary email)</li>
                  ) : null}
                </ul>
              )}
            </div>
          )}
          {lniFaxRan && (
            <div
              className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary-dark"
              role="status"
            >
              <p className="font-semibold">
                Fax L&I finished — {faxSentCount} fax{faxSentCount === 1 ? "" : "es"} sent.
              </p>
              <p className="mt-1 text-xs text-muted">
                Admin receives one batch summary email with destinations and job numbers.
              </p>
              {lniFaxRecipients.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-primary-dark/90">
                  {lniFaxRecipients.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                  {lniFaxMore > 0 ? (
                    <li>…and {lniFaxMore} more (see summary email)</li>
                  ) : null}
                </ul>
              )}
            </div>
          )}
          {vrcSkipped.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
              Skipped: {vrcSkipped.join(" · ")}
            </p>
          )}
          {vrcErrors.length > 0 && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
              Errors: {vrcErrors.join(" · ")}
            </p>
          )}
          {lniFaxSkipped.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
              Fax skipped: {lniFaxSkipped.join(" · ")}
            </p>
          )}
          {lniFaxErrors.length > 0 && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
              Fax errors: {lniFaxErrors.join(" · ")}
            </p>
          )}
        </div>
      )}

      <Validate999AckPanel />

      <BillingWorkspace
        rows={periodRows}
        defaultUsageIndicator={billingIsaUsageIndicator}
        vrcRoute={outboundEmailSettings.vrcRoute}
        lniFaxRoute={outboundEmailSettings.lniFaxRoute}
        adminEmails={outboundEmailSettings.adminEmails}
        setup={
          <>
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
          </>
        }
        addPayPeriod={
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
        }
      />

      <section>
        <LniFeesSection />
      </section>

      <Billing837SubmissionHistory />
    </div>
  );
}
