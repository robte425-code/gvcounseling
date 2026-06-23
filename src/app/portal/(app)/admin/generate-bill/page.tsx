import Link from "next/link";
import { requireAdmin } from "@/auth";
import { generateBillAction } from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function GenerateBillPage() {
  await requireAdmin();
  const periods = await prisma.payPeriod.findMany({ orderBy: { cutoffDate: "desc" } });

  const queuedByPeriod = await Promise.all(
    periods.map(async (period) => {
      const invoices = await prisma.invoice.findMany({
        where: {
          status: "SUBMITTED",
          submittedAt: { lte: period.cutoffDate },
        },
        include: { client: true, therapist: true },
        orderBy: { submittedAt: "asc" },
      });
      const total = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
      return { period, invoices, total };
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Generate L&I bill</h1>
        <p className="mt-2 text-muted">
          Creates one 837 EDI file for all submitted invoices on or before the pay period cutoff.
        </p>
      </div>

      {periods.length === 0 ? (
        <p className={portalCardClass}>
          No pay periods defined.{" "}
          <Link href="/portal/admin/pay-periods" className="text-primary hover:underline">
            Add a pay period first.
          </Link>
        </p>
      ) : (
        queuedByPeriod.map(({ period, invoices, total }) => (
          <section key={period.id} className={portalCardClass}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-xl font-semibold text-primary-dark">
                  {period.label ?? formatDate(period.cutoffDate)}
                </h2>
                <p className="text-sm text-muted">
                  Cutoff {formatDate(period.cutoffDate)} · {invoices.length} invoice
                  {invoices.length === 1 ? "" : "s"} · {formatCurrency(total)}
                </p>
              </div>
              <form action={generateBillAction}>
                <input type="hidden" name="payPeriodId" value={period.id} />
                <button
                  type="submit"
                  disabled={invoices.length === 0}
                  className={portalButtonClass}
                >
                  Generate 837
                </button>
              </form>
            </div>
            {invoices.length > 0 && (
              <ul className="mt-4 divide-y divide-border text-sm">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex justify-between py-2">
                    <span>
                      #{inv.invoiceNumber} · {inv.therapist.firstName} {inv.therapist.lastName} ·{" "}
                      {inv.client.lniClaimNumber}
                    </span>
                    <span>{formatCurrency(Number(inv.totalAmount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
