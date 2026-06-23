import { requireAdmin } from "@/auth";
import {
  createPayPeriodAction,
  deletePayPeriodAction,
} from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function PayPeriodsPage() {
  await requireAdmin();
  const periods = await prisma.payPeriod.findMany({
    orderBy: { cutoffDate: "desc" },
    include: { _count: { select: { bills: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Pay periods</h1>
        <p className="mt-2 text-muted">
          Set cutoff dates when submitted invoices are included in the next L&I bill.
        </p>
      </div>

      <form action={createPayPeriodAction} className={`${portalCardClass} grid gap-4 sm:grid-cols-2`}>
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
          <button type="submit" className={portalButtonClass}>
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
              <th className="py-2 pr-4">Payment</th>
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
      </div>
    </div>
  );
}
