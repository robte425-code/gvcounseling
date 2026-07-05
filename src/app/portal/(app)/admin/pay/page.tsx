import Link from "next/link";
import { requireAdmin } from "@/auth";
import { RemittanceImportForm } from "@/components/portal/RemittancePayPanel";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function PayPage() {
  await requireAdmin();

  const remittances = await prisma.remittanceAdvice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      _count: { select: { lines: true } },
      payRun: {
        include: {
          payouts: {
            include: { therapist: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Pay</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Import L&I Remittance Advice PDFs when payments arrive. Review matches, update invoice
          payment status, and calculate therapist pay from fee schedules.
        </p>
      </div>

      <section className={portalCardClass}>
        <p className={portalSectionHeadingClass}>Import</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">New remittance</h2>
        <p className="mt-1 text-xs text-muted">
          Upload a Remittance Advice (PDF) from L&I Provider Express Billing.
        </p>
        <div className="mt-4">
          <RemittanceImportForm />
        </div>
      </section>

      <section className={portalCardClass}>
        <p className={portalSectionHeadingClass}>History</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">Remittances</h2>
        {remittances.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No remittances imported yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {remittances.map((remittance) => {
              const therapistTotal = remittance.payRun?.payouts.reduce(
                (sum, payout) => sum + Number(payout.therapistAmount),
                0,
              );
              return (
                <li
                  key={remittance.id}
                  className="rounded-xl border border-border bg-primary/[0.02] p-4 transition hover:border-primary/20"
                >
                  <Link href={`/portal/admin/pay/${remittance.id}`} className="block">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-primary-dark">
                          RA {remittance.remittanceNumber} · {formatDate(remittance.invoiceDate)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Warrant {remittance.warrantRegister} · {remittance._count.lines} bills ·{" "}
                          {remittance.status === "APPLIED" ? "Applied" : "Preview"}
                        </p>
                      </div>
                      <div className="text-sm">
                        <p className="font-semibold text-primary-dark">
                          L&I paid {formatCurrency(Number(remittance.totalPaid))}
                        </p>
                        {therapistTotal != null && (
                          <p className="text-xs text-muted">
                            Therapist pay {formatCurrency(therapistTotal)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
