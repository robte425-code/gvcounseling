import Link from "next/link";
import { portalCardClass, portalTableClass, portalTableScrollClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import type { PaycheckSummaryRow } from "@/lib/paychecks";

type Props = {
  paychecks: PaycheckSummaryRow[];
  detailBasePath: "/portal/admin/paychecks" | "/portal/therapist/paychecks";
  showTherapistColumn: boolean;
};

function paycheckHref(
  basePath: Props["detailBasePath"],
  row: PaycheckSummaryRow,
  showTherapistColumn: boolean,
): string {
  if (showTherapistColumn) {
    return `${basePath}/${row.payPeriodId}?therapistId=${encodeURIComponent(row.therapistId)}`;
  }
  return `${basePath}/${row.payPeriodId}`;
}

export function PaychecksTable({ paychecks, detailBasePath, showTherapistColumn }: Props) {
  if (!paychecks.length) {
    return (
      <div className={portalCardClass}>
        <p className="text-sm text-muted">No paychecks yet. Paychecks appear after remittance advices are applied.</p>
      </div>
    );
  }

  return (
    <div className={portalCardClass}>
      <div className="overflow-x-auto">
        <table className={portalTableClass}>
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
              {showTherapistColumn && <th className="py-2 pr-4">Paycheck for</th>}
              <th className="py-2 pr-4">Pay period</th>
              <th className="py-2 pr-4">L&I payment date</th>
              <th className="py-2 pr-4 text-right">Invoices</th>
              <th className="py-2 text-right">Therapist pay</th>
            </tr>
          </thead>
          <tbody>
            {paychecks.map((row) => (
              <tr key={`${row.payPeriodId}:${row.therapistId}`} className="border-b border-border/70">
                {showTherapistColumn && (
                  <td className="py-3 pr-4">
                    <Link
                      href={paycheckHref(detailBasePath, row, showTherapistColumn)}
                      className="font-medium text-primary-dark hover:underline"
                    >
                      {row.therapistName}
                    </Link>
                  </td>
                )}
                <td className="py-3 pr-4">
                  {showTherapistColumn ? (
                    <>
                      <span className="font-medium text-foreground">{row.payPeriodLabel}</span>
                      <p className="text-xs text-muted">Cutoff {row.cutoffLabel}</p>
                    </>
                  ) : (
                    <>
                      <Link
                        href={paycheckHref(detailBasePath, row, showTherapistColumn)}
                        className="font-medium text-primary-dark hover:underline"
                      >
                        {row.payPeriodLabel}
                      </Link>
                      <p className="text-xs text-muted">Cutoff {row.cutoffLabel}</p>
                    </>
                  )}
                </td>
                <td className="py-3 pr-4 text-muted">{row.paymentDateLabel ?? "—"}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{row.invoiceCount}</td>
                <td className="py-3 text-right font-medium tabular-nums text-primary-dark">
                  {formatCurrency(row.therapistAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
