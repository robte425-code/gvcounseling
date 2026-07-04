import { Fragment } from "react";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { InvoiceTableRow } from "@/components/portal/InvoiceTableRow";
import { StatusBadge, portalButtonSecondaryClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { groupInvoicesByPayPeriod } from "@/lib/invoice-pay-period-grouping";
import { deleteInvoiceAction } from "@/lib/portal-actions";

export type TherapistInvoiceRow = {
  id: string;
  invoiceNumber: number;
  status: "DRAFT" | "SUBMITTED" | "BILLED";
  paymentStatus: "PAID" | "UNPAID" | "DENIED" | "APPEAL_IN_PROGRESS" | null;
  lniPaidAt: string | null;
  clientLabel: string;
  serviceDates: string;
  totalAmount: number;
  updatedAt: string;
  payPeriodId: string | null;
  payPeriodLabel: string | null;
  payPeriodSortKey: string;
  earliestServiceDate: string | null;
};

type Props = {
  invoices: TherapistInvoiceRow[];
};

export function TherapistInvoicesTable({ invoices }: Props) {
  const groups = groupInvoicesByPayPeriod(invoices);

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-border text-muted">
          <th className="py-2 pr-4">#</th>
          <th className="py-2 pr-4">Client</th>
          <th className="py-2 pr-4">Service date</th>
          <th className="py-2 pr-4">Status</th>
          <th className="py-2 pr-4">Payment</th>
          <th className="py-2 pr-4">Total</th>
          <th className="py-2 pr-4">Updated</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <Fragment key={group.key}>
            <tr key={group.key} className="border-b border-border bg-primary/5">
              <td colSpan={8} className="py-2.5 pr-4 text-sm font-semibold text-primary-dark">
                {group.label}
                <span className="ml-2 font-normal text-muted">
                  ({group.invoices.length} invoice{group.invoices.length === 1 ? "" : "s"})
                </span>
              </td>
            </tr>
            {group.invoices.map((inv) => (
              <InvoiceTableRow
                key={inv.id}
                href={`/portal/therapist/invoices/${inv.id}`}
                actions={
                  inv.status === "DRAFT" ? (
                    <form action={deleteInvoiceAction}>
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Delete invoice #${inv.invoiceNumber}?`}
                        className={`${portalButtonSecondaryClass} border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50`}
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  ) : null
                }
              >
                <td className="py-3 pr-4">{inv.invoiceNumber}</td>
                <td className="py-3 pr-4">{inv.clientLabel}</td>
                <td className="py-3 pr-4">{inv.serviceDates}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={inv.status} />
                </td>
                <td className="py-3 pr-4">
                  {inv.paymentStatus ? <StatusBadge status={inv.paymentStatus} /> : "—"}
                </td>
                <td className="py-3 pr-4">{formatCurrency(inv.totalAmount)}</td>
                <td className="py-3 pr-4">{formatDate(new Date(inv.updatedAt))}</td>
              </InvoiceTableRow>
            ))}
          </Fragment>
        ))}
        {invoices.length === 0 && (
          <tr>
            <td colSpan={8} className="py-6 text-center text-sm text-muted">
              No invoices yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
