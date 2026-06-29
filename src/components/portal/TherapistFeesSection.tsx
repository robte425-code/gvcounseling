import Link from "next/link";
import { createTherapistProcedureCodeFeeAction } from "@/lib/portal-actions";
import { TherapistFeesTable } from "@/components/portal/TherapistFeesTable";
import { loadTherapistProcedureCodeFees, serializeFeeSchedule } from "@/lib/procedure-fees";
import {
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { PROCEDURE_CODES } from "@/lib/constants";

type Props = {
  therapistId: string;
};

export async function TherapistFeesSection({ therapistId }: Props) {
  const fees = serializeFeeSchedule(await loadTherapistProcedureCodeFees(therapistId));

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
        Rates this therapist invoices the practice. L&I 837 billing uses the global fee schedule on
        Billing; the difference is practice margin.
      </p>

      <div className="mt-3">
        <TherapistFeesTable fees={fees} />
      </div>

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
