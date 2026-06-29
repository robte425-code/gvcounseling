import {
  createProcedureCodeFeeAction,
} from "@/lib/portal-actions";
import {
  formatCurrency,
  formatDate,
  PROCEDURE_CODES,
} from "@/lib/constants";
import { getCurrentProcedureFeeFromSchedule, loadAllProcedureCodeFees } from "@/lib/procedure-fees";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
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
    <div className={portalCardClass}>
      <h2 className={`${portalSectionHeadingClass} font-serif text-lg`}>L&I fees</h2>
      <p className="mt-1 text-sm text-muted">
        Set the L&I fee for each procedure code by effective date. These rates are used when
        generating 837 files.
      </p>

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-4">Code</th>
            <th className="py-2 pr-4">Description</th>
            <th className="py-2 pr-4">Current fee</th>
            <th className="py-2 pr-4">Effective from</th>
          </tr>
        </thead>
        <tbody>
          {currentFees.map(({ code, description, current }) => (
            <tr key={code} className="border-b border-border/60 last:border-0">
              <td className="py-3 pr-4 font-mono">{code}</td>
              <td className="py-3 pr-4">{description}</td>
              <td className="py-3 pr-4">
                {current ? formatCurrency(current.amount) : <span className="text-muted">Not set</span>}
              </td>
              <td className="py-3 pr-4">
                {current ? formatDate(current.effectiveFrom) : <span className="text-muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        action={createProcedureCodeFeeAction}
        className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label htmlFor="feeProcedureCode" className={portalLabelClass}>
            Procedure code
          </label>
          <select id="feeProcedureCode" name="procedureCode" required className={portalInputClass}>
            {PROCEDURE_CODES.map(({ code, description }) => (
              <option key={code} value={code}>
                {code} — {description}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="feeAmount" className={portalLabelClass}>
            Fee amount
          </label>
          <input
            id="feeAmount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className={portalInputClass}
            placeholder="0.00"
          />
        </div>
        <div>
          <label htmlFor="feeEffectiveFrom" className={portalLabelClass}>
            Effective from
          </label>
          <input
            id="feeEffectiveFrom"
            name="effectiveFrom"
            type="date"
            required
            className={portalInputClass}
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className={portalButtonSecondaryClass}>
            Save fee
          </button>
        </div>
      </form>

      {allFees.length > 0 && (
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-primary-dark">Fee history</h3>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Effective from</th>
                <th className="py-2 pr-4">Effective to</th>
              </tr>
            </thead>
            <tbody>
              {allFees.map((fee) => (
                <tr key={fee.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 font-mono">{fee.procedureCode}</td>
                  <td className="py-2 pr-4">{formatCurrency(Number(fee.amount))}</td>
                  <td className="py-2 pr-4">{formatDate(fee.effectiveFrom)}</td>
                  <td className="py-2 pr-4">
                    {fee.effectiveTo ? formatDate(fee.effectiveTo) : "Current"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
