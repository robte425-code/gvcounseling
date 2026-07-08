"use client";

import { useMemo, useState, Fragment } from "react";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { InvoiceTableRow } from "@/components/portal/InvoiceTableRow";
import { InvoicePaymentStatusCell } from "@/components/portal/InvoicePaymentStatusCell";
import { InvoiceTherapistPaymentCell } from "@/components/portal/InvoiceTherapistPaymentCell";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalTableClass,
  portalTableScrollClass,
  portalTableWideClass,
} from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { groupInvoicesByPayPeriod } from "@/lib/invoice-pay-period-grouping";
import { assignInvoicesToPayPeriodAction, deleteAdminInvoiceAction } from "@/lib/portal-actions";

export type AdminInvoiceRow = {
  id: string;
  invoiceNumber: number;
  status: "DRAFT" | "SUBMITTED" | "BILLED";
  paymentStatus: "PAID" | "DENIED" | "IN_PROCESS" | "UNPAID" | "APPEAL_IN_PROGRESS" | null;
  lniPaidAt: string | null;
  lniEobCodes: string[];
  lniEobCodeDescriptions: unknown;
  therapistPaid: boolean;
  totalAmount: number;
  submittedAt: string | null;
  therapistName: string;
  clientLabel: string;
  serviceDates: string;
  payPeriodId: string | null;
  payPeriodLabel: string | null;
  payPeriodSortKey: string;
  earliestServiceDate: string | null;
  assignable: boolean;
};

export type AdminInvoiceGroup = {
  key: string;
  label: string;
  invoices: AdminInvoiceRow[];
};

export type PayPeriodOption = {
  id: string;
  label: string;
};

type Props = {
  invoices: AdminInvoiceRow[];
  payPeriods: PayPeriodOption[];
  returnTo: string;
};

function formatPayPeriodOption(period: PayPeriodOption): string {
  return period.label;
}

export function AdminInvoicesTable({ invoices, payPeriods, returnTo }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupInvoicesByPayPeriod(invoices), [invoices]);
  const assignableIds = useMemo(
    () => new Set(invoices.filter((inv) => inv.assignable).map((inv) => inv.id)),
    [invoices],
  );
  const selectedCount = selected.size;
  const allAssignableSelected =
    assignableIds.size > 0 && [...assignableIds].every((id) => selected.has(id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(assignableIds) : new Set());
  }

  return (
    <div className="space-y-4">
      <form
        action={assignInvoicesToPayPeriodAction}
        className="flex flex-col gap-3 rounded-xl border border-border bg-primary/5 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <input type="hidden" name="returnTo" value={returnTo} />
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="invoiceIds" value={id} />
        ))}
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="payPeriodId" className={portalLabelCompactClass}>
            Pay period
          </label>
          <select
            id="payPeriodId"
            name="payPeriodId"
            className={portalInputCompactClass}
            defaultValue=""
          >
            <option value="">Clear assignment</option>
            {payPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {formatPayPeriodOption(period)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={selectedCount === 0}
          className={portalButtonClass}
        >
          {selectedCount === 0
            ? "Assign to pay period"
            : `Assign ${selectedCount} invoice${selectedCount === 1 ? "" : "s"}`}
        </button>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className={portalButtonSecondaryClass}
          >
            Clear selection
          </button>
        )}
      </form>

      <div className={portalTableScrollClass}>
        <table className={portalTableWideClass}>
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="py-2 pr-2">
              <input
                type="checkbox"
                aria-label="Select all assignable invoices"
                checked={allAssignableSelected}
                disabled={assignableIds.size === 0}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </th>
            <th className="py-2 pr-4">#</th>
            <th className="py-2 pr-4">Therapist</th>
            <th className="py-2 pr-4">Client</th>
            <th className="py-2 pr-4">Service date</th>
            <th className="py-2 pr-4">L&I status</th>
            <th className="py-2 pr-4">Payment</th>
            <th className="py-2 pr-4">Total</th>
            <th className="py-2 pr-4">Submitted</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <tr key={group.key} className="border-b border-border bg-primary/5">
                <td colSpan={10} className="py-2.5 pr-4 text-sm font-semibold text-primary-dark">
                  {group.label}
                  <span className="ml-2 font-normal text-muted">
                    ({group.invoices.length} invoice{group.invoices.length === 1 ? "" : "s"})
                  </span>
                </td>
              </tr>
              {group.invoices.map((inv) => (
                <InvoiceTableRow
                  key={inv.id}
                  href={`/portal/admin/invoices/${inv.id}`}
                  leading={
                    <input
                      type="checkbox"
                      aria-label={`Select invoice #${inv.invoiceNumber}`}
                      checked={selected.has(inv.id)}
                      disabled={!inv.assignable}
                      onChange={(e) => toggleOne(inv.id, e.target.checked)}
                    />
                  }
                  actions={
                    <form action={deleteAdminInvoiceAction}>
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Delete invoice #${inv.invoiceNumber}?`}
                        className={`${portalButtonSecondaryClass} border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50`}
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  }
                >
                  <td className="py-3 pr-4">{inv.invoiceNumber}</td>
                  <td className="py-3 pr-4">{inv.therapistName}</td>
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
                    <InvoiceTherapistPaymentCell therapistPaid={inv.therapistPaid} />
                  </td>
                  <td className="py-3 pr-4">{formatCurrency(inv.totalAmount)}</td>
                  <td className="py-3 pr-4">
                    {inv.submittedAt ? formatDate(new Date(inv.submittedAt)) : "—"}
                  </td>
                </InvoiceTableRow>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
      {invoices.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No invoices match this filter.</p>
      )}
    </div>
  );
}
