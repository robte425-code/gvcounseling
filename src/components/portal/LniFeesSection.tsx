import Link from "next/link";
import { createProcedureCodeFeeAction } from "@/lib/portal-actions";
import { formatCurrency, formatDate, PROCEDURE_CODES } from "@/lib/constants";
import { getCurrentProcedureFeeFromSchedule, loadAllProcedureCodeFees } from "@/lib/procedure-fees";
import {
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

export async function LniFeesSection() {
  const allFees = await loadAllProcedureCodeFees();
  const currentFees = PROCEDURE_CODES.map((entry) => ({
    code: entry.code,
    description: entry.description,
    current: getCurrentProcedureFeeFromSchedule(allFees, entry.code),
  }));

  return (
    <div className={portalCardCompactClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${portalSectionHeadingClass} font-serif text-base normal-case text-primary-dark`}>
          L&I fees
        </h2>
        <Link
          href="/portal/admin/billing/fees/history"
          className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
        >
          Fee history
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted">
        Rates billed to L&I in 837 files. Therapist invoices use each therapist&apos;s own fee schedule.
      </p>

      <table className="mt-3 w-full text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-1.5 pr-3">Procedure</th>
            <th className="py-1.5 pr-3">Current fee</th>
            <th className="py-1.5 pr-3">Effective from</th>
          </tr>
        </thead>
        <tbody>
          {currentFees.map(({ code, description, current }) => (
            <tr key={code} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-3">
                <span className="font-mono">{code}</span>
                <span className="text-muted"> · {description}</span>
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {current ? formatCurrency(current.amount) : <span className="text-muted">Not set</span>}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {current ? formatDate(current.effectiveFrom) : <span className="text-muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        action={createProcedureCodeFeeAction}
        className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5"
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
          <button type="submit" className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}>
            Save fee
          </button>
        </div>
      </form>
    </div>
  );
}
