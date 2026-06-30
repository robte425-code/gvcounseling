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
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { LniFeesSection } from "@/components/portal/LniFeesSection";

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
          payPeriodId: period.id,
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
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Billing</h1>
        <p className="mt-2 text-sm text-muted">
          Manage pay periods, L&I procedure fees, generate 837 files, and view billing history.
          Assign submitted invoices to a pay period on the{" "}
          <Link href="/portal/admin/invoices?status=SUBMITTED" className="text-primary hover:underline">
            Invoices
          </Link>{" "}
          page before generating.
        </p>
      </div>

      {syncMessage && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          {syncMessage}
        </p>
      )}

      <div className={portalCardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-primary-dark">Pay periods</h2>
            <p className="mt-0.5 text-xs text-muted">
              Sync from L&I (Bill Cutoff → cutoff, Warrant Date → expected payment) or add manually.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <form
          action={createPayPeriodAction}
          className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label htmlFor="label" className={portalLabelCompactClass}>
              Label
            </label>
            <input id="label" name="label" className={portalInputCompactClass} placeholder="June 2026" />
          </div>
          <div>
            <label htmlFor="cutoffDate" className={portalLabelCompactClass}>
              Cutoff date
            </label>
            <input id="cutoffDate" name="cutoffDate" type="date" required className={portalInputCompactClass} />
          </div>
          <div>
            <label htmlFor="paymentDate" className={portalLabelCompactClass}>
              Expected payment
            </label>
            <input id="paymentDate" name="paymentDate" type="date" className={portalInputCompactClass} />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <button type="submit" className={portalButtonSecondaryClass}>
              Add pay period
            </button>
          </div>
        </form>

        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Label</th>
              <th className="py-2 pr-4">Cutoff</th>
              <th className="py-2 pr-4">Expected payment</th>
              <th className="py-2 pr-4">837 files</th>
              <th className="py-2 pr-4">Assigned</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {periodRows.map(({ period, queuedInvoices }) => (
              <tr key={period.id} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-4">{period.label ?? "—"}</td>
                <td className="py-2.5 pr-4">{formatDate(period.cutoffDate)}</td>
                <td className="py-2.5 pr-4">{formatDate(period.paymentDate)}</td>
                <td className="py-2.5 pr-4">{period._count.bills}</td>
                <td className="py-2.5 pr-4">{queuedInvoices}</td>
                <td className="py-2.5">
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
          <p className="py-6 text-center text-sm text-muted">
            No pay periods yet. Click <strong>Sync from L&I</strong> or add one above.
          </p>
        )}
      </div>

      <LniFeesSection />
    </div>
  );
}
