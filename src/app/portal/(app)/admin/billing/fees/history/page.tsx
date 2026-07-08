import Link from "next/link";
import { requireAdmin } from "@/auth";
import {
  formatCurrency,
  formatDate,
  formatProcedureCodeLabel,
} from "@/lib/constants";
import { loadAllProcedureCodeFees } from "@/lib/procedure-fees";
import { portalButtonSecondaryClass, portalCardClass, portalTableNarrowClass, portalTableScrollClass } from "@/components/portal/ui";

export default async function LniFeeHistoryPage() {
  await requireAdmin();
  const fees = await loadAllProcedureCodeFees();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/admin/billing" className={`${portalButtonSecondaryClass} text-xs`}>
          ← Bill L&I
        </Link>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">L&I fee history</h1>
        <p className="mt-2 text-muted">
          L&I procedure rates by effective date. Used when generating 837 files to bill L&I. Therapist
          invoices use each therapist&apos;s own fee schedule.
        </p>
      </div>

      <div className={portalCardClass}>
        {fees.length === 0 ? (
          <p className="text-sm text-muted">No fees on file yet.</p>
        ) : (
          <div className={portalTableScrollClass}>
            <table className={portalTableNarrowClass}>
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Effective from</th>
                <th className="py-2 pr-4">Effective to</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4">{formatProcedureCodeLabel(fee.procedureCode)}</td>
                  <td className="py-3 pr-4">{formatCurrency(Number(fee.amount))}</td>
                  <td className="py-3 pr-4">{formatDate(fee.effectiveFrom)}</td>
                  <td className="py-3 pr-4">
                    {fee.effectiveTo ? formatDate(fee.effectiveTo) : "Current"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
