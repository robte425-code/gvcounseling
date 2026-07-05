"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  INVOICE_PAYMENT_FILTER_OPTIONS,
  type AdminInvoiceFilterValues,
  type PayPeriodFilterOption,
  type TherapistFilterOption,
} from "@/lib/invoice-list-filters";
import {
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

export type { AdminInvoiceFilterValues, PayPeriodFilterOption, TherapistFilterOption };

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "BILLED", label: "Billed" },
] as const;

type Props = {
  therapists: TherapistFilterOption[];
  payPeriods: PayPeriodFilterOption[];
  values: AdminInvoiceFilterValues;
  resultCount: number;
};

export function AdminInvoiceFilters({ therapists, payPeriods, values, resultCount }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const hasFilters = Boolean(
    values.status || values.therapistId || values.payPeriodId || values.paymentStatus,
  );

  const applyFilters = () => formRef.current?.requestSubmit();

  return (
    <form
      ref={formRef}
      method="get"
      action="/portal/admin/invoices"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-primary/5 p-4"
    >
      <div className="min-w-[10rem]">
        <label htmlFor="invoice-filter-status" className={portalLabelCompactClass}>
          Status
        </label>
        <select
          id="invoice-filter-status"
          name="status"
          className={portalInputCompactClass}
          defaultValue={values.status ?? ""}
          onChange={applyFilters}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[12rem] flex-1">
        <label htmlFor="invoice-filter-therapist" className={portalLabelCompactClass}>
          Therapist
        </label>
        <select
          id="invoice-filter-therapist"
          name="therapistId"
          className={portalInputCompactClass}
          defaultValue={values.therapistId ?? ""}
          onChange={applyFilters}
        >
          <option value="">All therapists</option>
          {therapists.map((therapist) => (
            <option key={therapist.id} value={therapist.id}>
              {therapist.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[12rem] flex-1">
        <label htmlFor="invoice-filter-pay-period" className={portalLabelCompactClass}>
          Pay period
        </label>
        <select
          id="invoice-filter-pay-period"
          name="payPeriodId"
          className={portalInputCompactClass}
          defaultValue={values.payPeriodId ?? ""}
          onChange={applyFilters}
        >
          <option value="">All pay periods</option>
          <option value="none">Unassigned</option>
          {payPeriods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[10rem]">
        <label htmlFor="invoice-filter-payment" className={portalLabelCompactClass}>
          Payment
        </label>
        <select
          id="invoice-filter-payment"
          name="paymentStatus"
          className={portalInputCompactClass}
          defaultValue={values.paymentStatus ?? ""}
          onChange={applyFilters}
        >
          {INVOICE_PAYMENT_FILTER_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <Link href="/portal/admin/invoices" className={portalButtonSecondaryClass}>
          Clear
        </Link>
      )}
      <p className="w-full text-sm text-muted">
        {resultCount} invoice{resultCount === 1 ? "" : "s"}
        {hasFilters ? " matching filters" : ""}
      </p>
    </form>
  );
}
