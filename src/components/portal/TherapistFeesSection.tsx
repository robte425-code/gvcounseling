import Link from "next/link";
import { createTherapistProcedureCodeFeeAction } from "@/lib/portal-actions";
import { formatCurrency, formatDate, PROCEDURE_CODES } from "@/lib/constants";
import {
  getCurrentProcedureFeeFromSchedule,
  loadTherapistProcedureCodeFees,
} from "@/lib/procedure-fees";
import {
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

type Props = {
  therapistId: string;
};

export async function TherapistFeesSection({ therapistId }: Props) {
  const allFees = await loadTherapistProcedureCodeFees(therapistId);
  const currentFees = PROCEDURE_CODES.map((entry) => ({
    code: entry.code,
    description: entry.description,
    current: getCurrentProcedureFeeFromSchedule(allFees, entry.code),
  }));

  return (
    <section className={portalCardCompactClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${portalSectionHeadingClass} font-serif text-base normal-case text-primary-dark`}>
          Procedure code fees
        </h2>
        <Link
          href={`/portal/admin/therapists/${therapistId}/fees/history`}
          className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
        >
          Fee history
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted">
        Rates for this therapist&apos;s L&I billing. When generating 837 files, therapist fees take
        precedence; otherwise the global L&I fee schedule on Billing applies.
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
        action={createTherapistProcedureCodeFeeAction}
        className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input type="hidden" name="therapistId" value={therapistId} />
        <div className="sm:col-span-2">
          <label htmlFor={`feeProcedureCode-${therapistId}`} className={portalLabelCompactClass}>
            Procedure code
          </label>
          <select
            id={`feeProcedureCode-${therapistId}`}
            name="procedureCode"
            required
            className={portalInputCompactClass}
          >
            {PROCEDURE_CODES.map(({ code, description }) => (
              <option key={code} value={code}>
                {code} — {description}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`feeAmount-${therapistId}`} className={portalLabelCompactClass}>
            Amount
          </label>
          <input
            id={`feeAmount-${therapistId}`}
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
          <label htmlFor={`feeEffectiveFrom-${therapistId}`} className={portalLabelCompactClass}>
            Effective from
          </label>
          <input
            id={`feeEffectiveFrom-${therapistId}`}
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
    </section>
  );
}
