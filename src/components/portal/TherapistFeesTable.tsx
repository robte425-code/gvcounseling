import { portalTableNarrowClass, portalTableScrollClass } from "@/components/portal/ui";
import { formatCurrency, formatDate, PROCEDURE_CODES } from "@/lib/constants";
import { getCurrentProcedureFeeFromSchedule, type FeeScheduleRow } from "@/lib/procedure-fee-schedule";

type Props = {
  fees: FeeScheduleRow[];
};

export function TherapistFeesTable({ fees }: Props) {
  const currentFees = PROCEDURE_CODES.map((entry) => ({
    code: entry.code,
    description: entry.description,
    current: getCurrentProcedureFeeFromSchedule(fees, entry.code),
  }));

  return (
    <div className={portalTableScrollClass}>
      <table className={portalTableNarrowClass}>
      <thead>
        <tr className="border-b border-border text-muted">
          <th className="py-2 pr-4">Procedure</th>
          <th className="py-2 pr-4">Current fee</th>
          <th className="py-2 pr-4">Effective from</th>
        </tr>
      </thead>
      <tbody>
        {currentFees.map(({ code, description, current }) => (
          <tr key={code} className="border-b border-border/60 last:border-0">
            <td className="py-3 pr-4">
              <span className="font-mono">{code}</span>
              <span className="text-muted"> · {description}</span>
            </td>
            <td className="py-3 pr-4 whitespace-nowrap">
              {current ? formatCurrency(current.amount) : <span className="text-muted">Not set</span>}
            </td>
            <td className="py-3 pr-4 whitespace-nowrap">
              {current ? formatDate(current.effectiveFrom) : <span className="text-muted">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
