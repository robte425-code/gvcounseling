import Link from "next/link";
import { portalCardClass, portalTableWideClass, portalTableScrollClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import type { PaycheckInvoiceRow } from "@/lib/paychecks";

type Props = {
  invoices: PaycheckInvoiceRow[];
  paycheckPayPeriodId: string;
};

export function PaycheckDetailTable({ invoices, paycheckPayPeriodId }: Props) {
  if (!invoices.length) {
    return (
      <div className={portalCardClass}>
        <p className="text-sm text-muted">No L&I-paid invoices on this paycheck.</p>
      </div>
    );
  }

  return (
    <div className={portalCardClass}>
      <div className="overflow-x-auto">
        <table className={portalTableWideClass}>
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Invoice #</th>
              <th className="py-2 pr-4">Client</th>
              <th className="py-2 pr-4">Service dates</th>
              <th className="py-2 pr-4">Billed in period</th>
              <th className="py-2 pr-4">RA</th>
              <th className="py-2 text-right">Therapist pay</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((row) => {
              const fromOtherPeriod =
                row.billingPayPeriodId != null && row.billingPayPeriodId !== paycheckPayPeriodId;
              return (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="py-3 pr-4">
                    <Link href={row.invoiceHref} className="font-medium text-primary-dark hover:underline">
                      #{row.invoiceNumber}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{row.clientLabel}</td>
                  <td className="py-3 pr-4 text-muted">{row.serviceDates}</td>
                  <td className="py-3 pr-4">
                    <span className={fromOtherPeriod ? "font-medium text-amber-900" : ""}>
                      {row.billingPayPeriodLabel ?? "Unassigned"}
                    </span>
                    {fromOtherPeriod && (
                      <p className="text-xs text-muted">Billed in a different pay period</p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted">
                    <span className="font-mono text-xs">
                      {row.remittanceNumber} / {row.warrantRegister}
                    </span>
                    <p className="text-xs">{row.remittanceInvoiceDate}</p>
                  </td>
                  <td className="py-3 text-right font-medium tabular-nums text-primary-dark">
                    {formatCurrency(row.therapistAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted">
        L&I payment dates can include invoices originally billed in earlier pay periods.
      </p>
    </div>
  );
}
