"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminInvoiceRow, PayPeriodOption } from "@/components/portal/AdminInvoicesTable";
import { InvoicePaymentStatusCell } from "@/components/portal/InvoicePaymentStatusCell";
import { InvoiceTherapistPaymentCell } from "@/components/portal/InvoiceTherapistPaymentCell";
import { InvoiceTableRow } from "@/components/portal/InvoiceTableRow";
import {
  StatusBadge,
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
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
  const hasPayPeriods = payPeriods.length > 0;

  if (sorted.length === 0) return null;

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    setSelected(checked ? new Set(sorted.map((inv) => inv.id)) : new Set());
  }

  return (
    <section className={`${portalCardClass} border-amber-200 bg-amber-50/40`}>
      <p className={portalSectionHeadingClass}>Needs pay period</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
        {sorted.length} unassigned invoice{sorted.length === 1 ? "" : "s"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Submitted invoices without a pay period. Select them below, choose a pay period, then assign
        before generating an 837 on the Billing page.
      </p>

      {!hasPayPeriods && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          No pay periods are set up yet. Add cutoffs on the Billing page before assigning invoices.
        </p>
      )}

      <form action={assignInvoicesToPayPeriodAction} className="mt-4 space-y-4">
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-white/80 p-4 sm:flex-row sm:flex-wrap sm:items-end">
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
              disabled={!hasPayPeriods}
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
          <button
            type="submit"
            disabled={selectedCount === 0 || !hasPayPeriods}
            className={portalButtonClass}
          >
            {selectedCount === 0
              ? "Assign to pay period"
              : `Assign ${selectedCount} to ${nextPayPeriodLabel ?? "pay period"}`}
          </button>
          <button
            type="button"
            onClick={() => selectAll(true)}
            className={portalButtonSecondaryClass}
          >
            Select all
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => selectAll(false)}
              className={portalButtonSecondaryClass}
            >
              Clear selection
            </button>
          )}
        </div>

        <div className={portalTableScrollClass}>
          <table className={portalTableWideClass}>
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Select all unassigned invoices"
                    checked={allSelected}
                    onChange={(e) => selectAll(e.target.checked)}
                  />
                </th>
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Status</th>
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
                        name="invoiceIds"
                        value={inv.id}
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
                  <td className="py-3 pr-4">
                    <StatusBadge status={inv.status} />
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
                    <InvoiceTherapistPaymentCell therapistPayment={inv.therapistPayment} />
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
      </form>
    </section>
  );
}
