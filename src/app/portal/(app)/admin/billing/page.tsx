import Link from "next/link";
import { requireAdmin } from "@/auth";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import {
  createPayPeriodAction,
  deletePayPeriodAction,
  generateBillAction,
  syncPayPeriodsFromLniAction,
} from "@/lib/portal-actions";
import { LNI_PAYMENT_STATUS_URL } from "@/lib/lni-pay-periods";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; created?: string; updated?: string; total?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const periods = await prisma.payPeriod.findMany({
    orderBy: { cutoffDate: "asc" },
    include: { _count: { select: { bills: true } } },
  });

  const periodRows = await Promise.all(
    periods.map(async (period) => {
      const queuedInvoices = await prisma.invoice.count({
        where: {
          status: "SUBMITTED",
          submittedAt: { lte: period.cutoffDate },
        },
      });
      return { period, queuedInvoices };
    }),
  );

  const syncMessage =
    params.synced === "1"
      ? `Synced ${params.total ?? "0"} pay periods from L&I (${params.created ?? "0"} new, ${params.updated ?? "0"} updated).`
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Billing</h1>
        <p className="mt-2 text-muted">
          Manage pay periods, generate 837 files, and view billing history for each cutoff date.
        </p>
      </div>

      {syncMessage && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          {syncMessage}
        </p>
      )}

      <div className={`${portalCardClass} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h2 className="font-serif text-lg font-semibold text-primary-dark">L&I payment schedule</h2>
          <p className="mt-1 text-sm text-muted">
            Bill Cutoff Date → cutoff · Warrant Date → expected payment
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action={syncPayPeriodsFromLniAction}>
            <button type="submit" className={portalButtonClass}>
              Sync from L&I
            </button>
          </form>
          <a
            href={LNI_PAYMENT_STATUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={portalButtonSecondaryClass}
          >
            View on LNI.wa.gov
          </a>
        </div>
      </div>

      <form action={createPayPeriodAction} className={`${portalCardClass} grid gap-4 sm:grid-cols-2`}>
        <div className="sm:col-span-2">
          <h2 className="font-serif text-lg font-semibold text-primary-dark">Add pay period</h2>
        </div>
        <div>
          <label htmlFor="label" className={portalLabelClass}>
            Label (optional)
          </label>
          <input id="label" name="label" className={portalInputClass} placeholder="June 2026" />
        </div>
        <div>
          <label htmlFor="cutoffDate" className={portalLabelClass}>
            Cutoff date
          </label>
          <input id="cutoffDate" name="cutoffDate" type="date" required className={portalInputClass} />
        </div>
        <div>
          <label htmlFor="paymentDate" className={portalLabelClass}>
            Expected payment date (optional)
          </label>
          <input id="paymentDate" name="paymentDate" type="date" className={portalInputClass} />
        </div>
        <div className="flex items-end">
          <button type="submit" className={portalButtonSecondaryClass}>
            Add pay period
          </button>
        </div>
      </form>

      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Label</th>
              <th className="py-2 pr-4">Cutoff</th>
              <th className="py-2 pr-4">Expected payment</th>
              <th className="py-2 pr-4">837 files</th>
              <th className="py-2 pr-4">Queued</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {periodRows.map(({ period, queuedInvoices }) => (
              <tr key={period.id} className="border-b border-border/60 last:border-0">
                <td className="py-3 pr-4">{period.label ?? "—"}</td>
                <td className="py-3 pr-4">{formatDate(period.cutoffDate)}</td>
                <td className="py-3 pr-4">{formatDate(period.paymentDate)}</td>
                <td className="py-3 pr-4">{period._count.bills}</td>
                <td className="py-3 pr-4">{queuedInvoices}</td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <form action={generateBillAction}>
                      <input type="hidden" name="payPeriodId" value={period.id} />
                      <button
                        type="submit"
                        disabled={queuedInvoices === 0}
                        className={portalButtonClass}
                      >
                        Generate 837
                      </button>
                    </form>
                    <Link
                      href={`/portal/admin/billing/${period.id}/bills`}
                      className={portalButtonSecondaryClass}
                    >
                      History
                    </Link>
                    {period._count.bills === 0 && (
                      <form action={deletePayPeriodAction}>
                        <input type="hidden" name="id" value={period.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Delete pay period ${period.label ?? formatDate(period.cutoffDate)}?`}
                          className={`${portalButtonSecondaryClass} text-red-700`}
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {periodRows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No pay periods yet. Click <strong>Sync from L&I</strong> to import the schedule.
          </p>
        )}
      </div>
    </div>
  );
}
