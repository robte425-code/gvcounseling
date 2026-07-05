"use client";

import Link from "next/link";
import { useRef } from "react";
import type { InvoiceStatus } from "@/generated/prisma/client";
import {
  INVOICE_PAYMENT_FILTER_OPTIONS,
  type InvoicePaymentFilter,
  type PayPeriodFilterOption,
} from "@/lib/invoice-list-filters";
import {
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

export type TherapistInvoiceFilterValues = {
  status?: InvoiceStatus;
  payPeriodId?: string;
  paymentStatus?: InvoicePaymentFilter;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "BILLED", label: "Billed" },
] as const;

export function buildTherapistInvoicesHref(values: TherapistInvoiceFilterValues): string {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.payPeriodId) params.set("payPeriodId", values.payPeriodId);
  if (values.paymentStatus) params.set("paymentStatus", values.paymentStatus);
  const query = params.toString();
  return query ? `/portal/therapist/invoices?${query}` : "/portal/therapist/invoices";
}

type Props = {
  payPeriods: PayPeriodFilterOption[];
  values: TherapistInvoiceFilterValues;
  resultCount: number;
};

export function TherapistInvoiceFilters({ payPeriods, values, resultCount }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const hasFilters = Boolean(values.status || values.payPeriodId || values.paymentStatus);

  const applyFilters = () => formRef.current?.requestSubmit();

  return (
    <form
      ref={formRef}
      method="get"
      action="/portal/therapist/invoices"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-primary/5 p-4"
    >
      <div className="min-w-[10rem]">
        <label htmlFor="therapist-invoice-filter-status" className={portalLabelCompactClass}>
          Status
        </label>
        <select
          id="therapist-invoice-filter-status"
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
        <label htmlFor="therapist-invoice-filter-pay-period" className={portalLabelCompactClass}>
          Pay period
        </label>
        <select
          id="therapist-invoice-filter-pay-period"
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
        <label htmlFor="therapist-invoice-filter-payment" className={portalLabelCompactClass}>
          Payment
        </label>
        <select
          id="therapist-invoice-filter-payment"
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
        <Link href="/portal/therapist/invoices" className={portalButtonSecondaryClass}>
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
