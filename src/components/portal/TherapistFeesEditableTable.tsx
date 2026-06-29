import {
  createTherapistProcedureCodeFeeAction,
  updateTherapistProcedureCodeFeeAction,
} from "@/lib/portal-actions";
import { formatDate, PROCEDURE_CODES } from "@/lib/constants";
import {
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import type { TherapistFeeHistoryRow } from "@/components/portal/TherapistFeesHistoryTable";

type Props = {
  therapistId: string;
  fees: TherapistFeeHistoryRow[];
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function TherapistFeesEditableTable({ therapistId, fees }: Props) {
  if (fees.length === 0) {
    return <p className="text-sm text-muted">No fees on file yet.</p>;
  }

  return (
    <div className="space-y-3">
      {fees.map((fee) => (
        <form
          key={fee.id}
          action={updateTherapistProcedureCodeFeeAction}
          className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <input type="hidden" name="id" value={fee.id} />
          <input type="hidden" name="therapistId" value={therapistId} />
          <div className="sm:col-span-2">
            <label htmlFor={`fee-code-${fee.id}`} className={portalLabelCompactClass}>
              Procedure code
            </label>
            <select
              id={`fee-code-${fee.id}`}
              name="procedureCode"
              required
              defaultValue={fee.procedureCode}
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
            <label htmlFor={`fee-amount-${fee.id}`} className={portalLabelCompactClass}>
              Amount
            </label>
            <input
              id={`fee-amount-${fee.id}`}
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={Number(fee.amount).toFixed(2)}
              className={portalInputCompactClass}
            />
          </div>
          <div>
            <label htmlFor={`fee-from-${fee.id}`} className={portalLabelCompactClass}>
              Effective from
            </label>
            <input
              id={`fee-from-${fee.id}`}
              name="effectiveFrom"
              type="date"
              required
              defaultValue={toDateInputValue(fee.effectiveFrom)}
              className={portalInputCompactClass}
            />
          </div>
          <div>
            <span className={portalLabelCompactClass}>Effective to</span>
            <p className="mt-2 text-sm text-muted">
              {fee.effectiveTo ? formatDate(fee.effectiveTo) : "Current"}
            </p>
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}>
              Save
            </button>
          </div>
        </form>
      ))}

      <form
        action={createTherapistProcedureCodeFeeAction}
        className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input type="hidden" name="therapistId" value={therapistId} />
        <div className="sm:col-span-2">
          <label htmlFor={`feeProcedureCode-${therapistId}`} className={portalLabelCompactClass}>
            Add procedure code
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
        <div className="flex items-end sm:col-span-2">
          <button type="submit" className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}>
            Add fee
          </button>
        </div>
      </form>
    </div>
  );
}
