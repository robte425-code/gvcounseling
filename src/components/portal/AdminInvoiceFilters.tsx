import Link from "next/link";
import {
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

export type TherapistFilterOption = {
  id: string;
  label: string;
};

export type PayPeriodFilterOption = {
  id: string;
  label: string;
};

export type AdminInvoiceFilterValues = {
  status?: string;
  therapistId?: string;
  payPeriodId?: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "BILLED", label: "Billed" },
] as const;

export function buildAdminInvoicesHref(values: AdminInvoiceFilterValues): string {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.therapistId) params.set("therapistId", values.therapistId);
  if (values.payPeriodId) params.set("payPeriodId", values.payPeriodId);
  const query = params.toString();
  return query ? `/portal/admin/invoices?${query}` : "/portal/admin/invoices";
}

type Props = {
  therapists: TherapistFilterOption[];
  payPeriods: PayPeriodFilterOption[];
  values: AdminInvoiceFilterValues;
  resultCount: number;
};

export function AdminInvoiceFilters({ therapists, payPeriods, values, resultCount }: Props) {
  const hasFilters = Boolean(values.status || values.therapistId || values.payPeriodId);

  return (
    <form
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

      <button type="submit" className={portalButtonSecondaryClass}>
        Apply filters
      </button>
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
