import Link from "next/link";
import { createProcedureCodeFeeAction } from "@/lib/portal-actions";
import { formatCurrency, formatDate, PROCEDURE_CODES } from "@/lib/constants";
import { getCurrentProcedureFeeFromSchedule, loadAllProcedureCodeFees } from "@/lib/procedure-fees";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
  portalTableNarrowClass,
  portalTableScrollClass,
} from "@/components/portal/ui";

export async function LniFeesSection() {
  const allFees = await loadAllProcedureCodeFees();
  const currentFees = PROCEDURE_CODES.map((entry) => ({
    code: entry.code,
    description: entry.description,
    current: getCurrentProcedureFeeFromSchedule(allFees, entry.code),
  }));

  return (
    <div className={portalCardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={portalSectionHeadingClass}>Fee schedule</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">L&I fees</h2>
        </div>
        <Link
          href="/portal/admin/billing/fees/history"
          className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
        >
          Fee history
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted">
        Rates billed to L&I in 837 files. Therapist invoices use each therapist&apos;s own fee schedule.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className={portalTableScrollClass}>
          <table className={portalTableNarrowClass}>
          <thead>
            <tr className="border-b border-border bg-primary/[0.03] text-muted">
              <th className="px-4 py-2.5 font-medium">Procedure</th>
              <th className="px-4 py-2.5 font-medium">Current fee</th>
              <th className="px-4 py-2.5 font-medium">Effective from</th>
            </tr>
          </thead>
          <tbody>
            {currentFees.map(({ code, description, current }) => (
              <tr key={code} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-mono font-medium">{code}</span>
                  <span className="text-muted"> · {description}</span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {current ? formatCurrency(current.amount) : <span className="text-muted">Not set</span>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {current ? formatDate(current.effectiveFrom) : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <form
        action={createProcedureCodeFeeAction}
        className="mt-4 grid gap-3 rounded-xl border border-border bg-primary/[0.02] p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="sm:col-span-2">
          <label htmlFor="feeProcedureCode" className={portalLabelCompactClass}>
            Procedure code
          </label>
          <select id="feeProcedureCode" name="procedureCode" required className={portalInputCompactClass}>
            {PROCEDURE_CODES.map(({ code, description }) => (
              <option key={code} value={code}>
                {code} — {description}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="feeAmount" className={portalLabelCompactClass}>
            Amount
          </label>
          <input
            id="feeAmount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className={portalInputCompactClass}
            placeholder="0.00"
          />
        </div>
        <div>
          <label htmlFor="feeEffectiveFrom" className={portalLabelCompactClass}>
            Effective from
          </label>
          <input
            id="feeEffectiveFrom"
            name="effectiveFrom"
            type="date"
            required
            className={portalInputCompactClass}
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className={portalButtonSecondaryClass}>
            Save fee
          </button>
        </div>
      </form>
    </div>
  );
}
