import {
  createTherapistProcedureCodeFeeAction,
  updateTherapistProcedureCodeFeeAction,
} from "@/lib/portal-actions";
import { PROCEDURE_CODES } from "@/lib/constants";
import { getCurrentProcedureFeeRecordFromSchedule } from "@/lib/procedure-fee-schedule";
import type { TherapistFeeHistoryRow } from "@/components/portal/TherapistFeesHistoryTable";
import {
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalTableNarrowClass,
  portalTableScrollClass,
} from "@/components/portal/ui";

type Props = {
  therapistId: string;
  fees: TherapistFeeHistoryRow[];
};

function toDateInputValue(date: Date | string): string {
  const text = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

export function TherapistCurrentFeesEditor({ therapistId, fees }: Props) {
  const rows = PROCEDURE_CODES.map((entry) => ({
    code: entry.code,
    description: entry.description,
    current: getCurrentProcedureFeeRecordFromSchedule(fees, entry.code),
  }));

  return (
    <div className="space-y-3">
      <div className={portalTableScrollClass}>
        <table className={`${portalTableNarrowClass} text-xs sm:text-sm`}>
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-1.5 pr-3">Procedure</th>
            <th className="py-1.5 pr-3">Current fee</th>
            <th className="py-1.5 pr-3">Effective from</th>
            <th className="py-1.5 pr-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ code, description, current }) => (
            <tr key={code} className="border-b border-border/60 last:border-0 align-top">
              <td className="py-2 pr-3">
                <span className="font-mono">{code}</span>
                <span className="text-muted"> · {description}</span>
              </td>
              {current ? (
                <td colSpan={3} className="py-2 pr-0">
                  <form
                    action={updateTherapistProcedureCodeFeeAction}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <input type="hidden" name="id" value={current.id} />
                    <input type="hidden" name="therapistId" value={therapistId} />
                    <input type="hidden" name="procedureCode" value={code} />
                    <div>
                      <label htmlFor={`fee-amount-${code}`} className={portalLabelCompactClass}>
                        Amount
                      </label>
                      <input
                        id={`fee-amount-${code}`}
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        defaultValue={current.amount.toFixed(2)}
                        className={portalInputCompactClass}
                      />
                    </div>
                    <div>
                      <label htmlFor={`fee-from-${code}`} className={portalLabelCompactClass}>
                        Effective from
                      </label>
                      <input
                        id={`fee-from-${code}`}
                        name="effectiveFrom"
                        type="date"
                        required
                        defaultValue={toDateInputValue(current.effectiveFrom)}
                        className={portalInputCompactClass}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </td>
              ) : (
                <td colSpan={3} className="py-2 pr-0">
                  <form
                    action={createTherapistProcedureCodeFeeAction}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <input type="hidden" name="therapistId" value={therapistId} />
                    <input type="hidden" name="procedureCode" value={code} />
                    <div>
                      <label htmlFor={`fee-amount-new-${code}`} className={portalLabelCompactClass}>
                        Amount
                      </label>
                      <input
                        id={`fee-amount-new-${code}`}
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
                      <label htmlFor={`fee-from-new-${code}`} className={portalLabelCompactClass}>
                        Effective from
                      </label>
                      <input
                        id={`fee-from-new-${code}`}
                        name="effectiveFrom"
                        type="date"
                        required
                        className={portalInputCompactClass}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
