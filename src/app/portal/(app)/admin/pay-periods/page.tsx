import { requireAdmin } from "@/auth";
import {
  createPayPeriodAction,
  deletePayPeriodAction,
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

export default async function PayPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; created?: string; updated?: string; total?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const periods = await prisma.payPeriod.findMany({
    orderBy: { cutoffDate: "desc" },
    include: { _count: { select: { bills: true } } },
  });

  const syncMessage =
    params.synced === "1"
      ? `Synced ${params.total ?? "0"} pay periods from L&I (${params.created ?? "0"} new, ${params.updated ?? "0"} updated).`
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Pay periods</h1>
        <p className="mt-2 text-muted">
          Cutoff dates control which submitted invoices are included in each L&I bill. Sync from
          L&I&apos;s official payment schedule or add dates manually.
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
          <h2 className="font-serif text-lg font-semibold text-primary-dark">Add manually</h2>
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
              <th className="py-2 pr-4">Bills</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="py-3 pr-4">{p.label ?? "—"}</td>
                <td className="py-3 pr-4">{formatDate(p.cutoffDate)}</td>
                <td className="py-3 pr-4">{formatDate(p.paymentDate)}</td>
                <td className="py-3 pr-4">{p._count.bills}</td>
                <td className="py-3 text-right">
                  {p._count.bills === 0 && (
                    <form action={deletePayPeriodAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-sm text-red-700 hover:underline">
                        Delete
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {periods.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No pay periods yet. Click <strong>Sync from L&I</strong> to import the schedule.
          </p>
        )}
      </div>
    </div>
  );
}
