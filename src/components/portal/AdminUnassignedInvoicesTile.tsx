"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminInvoiceRow, PayPeriodOption } from "@/components/portal/AdminInvoicesTable";
import { InvoicePaymentStatusCell } from "@/components/portal/InvoicePaymentStatusCell";
import { InvoiceTherapistPaymentCell } from "@/components/portal/InvoiceTherapistPaymentCell";
import { InvoiceTableRow } from "@/components/portal/InvoiceTableRow";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
  portalTableScrollClass,
  portalTableWideClass,
} from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { assignInvoicesToPayPeriodAction } from "@/lib/portal-actions";

type Props = {
  invoices: AdminInvoiceRow[];
  payPeriods: PayPeriodOption[];
  nextPayPeriodId: string | null;
  returnTo: string;
};

export function AdminUnassignedInvoicesTile({
  invoices,
  payPeriods,
  nextPayPeriodId,
  returnTo,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sorted = useMemo(
    () =>
      [...invoices].sort((a, b) => {
        const dateCompare = (a.earliestServiceDate ?? "").localeCompare(b.earliestServiceDate ?? "");
        if (dateCompare !== 0) return dateCompare;
        return a.invoiceNumber - b.invoiceNumber;
      }),
    [invoices],
  );
  const selectedCount = selected.size;
  const allSelected = sorted.length > 0 && sorted.every((inv) => selected.has(inv.id));
  const nextPayPeriodLabel = payPeriods.find((period) => period.id === nextPayPeriodId)?.label;

  if (sorted.length === 0) return null;

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <section className={`${portalCardClass} border-amber-200 bg-amber-50/40`}>
      <p className={portalSectionHeadingClass}>Needs pay period</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
        {sorted.length} unassigned invoice{sorted.length === 1 ? "" : "s"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Submitted invoices without a pay period. Assign them to the upcoming cutoff before generating
        an 837 on the Billing page.
      </p>

      <form
        action={assignInvoicesToPayPeriodAction}
        className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-white/80 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <input type="hidden" name="returnTo" value={returnTo} />
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="invoiceIds" value={id} />
        ))}
        <div className="w-full flex-1 sm:min-w-[12rem]">
          <label htmlFor="unassigned-payPeriodId" className={portalLabelCompactClass}>
            Pay period
          </label>
          <select
            id="unassigned-payPeriodId"
            name="payPeriodId"
            className={portalInputCompactClass}
            defaultValue={nextPayPeriodId ?? ""}
            required
          >
            <option value="" disabled>
              Select pay period
            </option>
            {payPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={selectedCount === 0} className={portalButtonClass}>
          {selectedCount === 0
            ? "Assign to pay period"
            : `Assign ${selectedCount} to ${nextPayPeriodLabel ?? "pay period"}`}
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set(sorted.map((inv) => inv.id)))}
          className={portalButtonSecondaryClass}
        >
          Select all
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

      <div className={`mt-4 ${portalTableScrollClass}`}>
        <table className={portalTableWideClass}>
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-2">
                <input
                  type="checkbox"
                  aria-label="Select all unassigned invoices"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(sorted.map((inv) => inv.id)) : new Set())
                  }
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((inv) => (
              <InvoiceTableRow
                key={inv.id}
                href={`/portal/admin/invoices/${inv.id}`}
                leading={
                  <label className="flex cursor-pointer items-center justify-center p-1">
                    <input
                      type="checkbox"
                      aria-label={`Select invoice #${inv.invoiceNumber}`}
                      checked={selected.has(inv.id)}
                      onChange={(e) => toggleOne(inv.id, e.target.checked)}
                    />
                  </label>
                }
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/portal/admin/invoices/${inv.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {inv.invoiceNumber}
                  </Link>
                </td>
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
          </tbody>
        </table>
      </div>
    </section>
  );
}
