import { Fragment } from "react";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { InvoiceTableRow } from "@/components/portal/InvoiceTableRow";
import { InvoicePaymentStatusCell } from "@/components/portal/InvoicePaymentStatusCell";
import { InvoiceTherapistPaymentCell } from "@/components/portal/InvoiceTherapistPaymentCell";
import { portalButtonSecondaryClass, portalTableClass, portalTableScrollClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { groupInvoicesByPayPeriod } from "@/lib/invoice-pay-period-grouping";
import { deleteInvoiceAction } from "@/lib/portal-actions";
import type { TherapistPaymentDisplay } from "@/lib/invoice-therapist-payment";

export type TherapistInvoiceRow = {
  id: string;
  invoiceNumber: number;
  status: "DRAFT" | "SUBMITTED" | "BILLED";
  paymentStatus: "PAID" | "DENIED" | "IN_PROCESS" | "UNPAID" | "APPEAL_IN_PROGRESS" | null;
  lniPaidAt: string | null;
  lniEobCodes: string[];
  lniEobCodeDescriptions: unknown;
  therapistPayment: TherapistPaymentDisplay;
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
  hasFilters?: boolean;
  invoicesReturnTo?: string;
};

export function TherapistInvoicesTable({
  invoices,
  hasFilters = false,
  invoicesReturnTo = "/portal/therapist/invoices",
}: Props) {
  const groups = groupInvoicesByPayPeriod(invoices);

  return (
    <div className={portalTableScrollClass}>
      <table className={portalTableClass}>
      <thead>
        <tr className="border-b border-border text-muted">
          <th className="py-2 pr-4">#</th>
          <th className="py-2 pr-4">Client</th>
          <th className="py-2 pr-4">Service date</th>
          <th className="py-2 pr-4">L&I status</th>
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
                      <input type="hidden" name="returnTo" value={invoicesReturnTo} />
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
                  <InvoicePaymentStatusCell
                    paymentStatus={inv.paymentStatus}
                    lniPaidAt={inv.lniPaidAt}
                    lniEobCodes={inv.lniEobCodes}
                    lniEobCodeDescriptions={inv.lniEobCodeDescriptions}
                  />
                </td>
                <td className="py-3 pr-4">
                  <InvoiceTherapistPaymentCell therapistPayment={inv.therapistPayment} />
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
              {hasFilters ? "No invoices match these filters." : "No invoices yet."}
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </div>
  );
}
