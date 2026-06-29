import { formatCurrency, formatDate, formatProcedureCodeLabel } from "@/lib/constants";

export type TherapistFeeHistoryRow = {
  id: string;
  procedureCode: string;
  amount: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type Props = {
  fees: TherapistFeeHistoryRow[];
  emptyMessage?: string;
};

export function TherapistFeesHistoryTable({
  fees,
  emptyMessage = "No fees on file yet.",
}: Props) {
  if (fees.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <table className="w-full text-left text-sm">
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
  );
}
