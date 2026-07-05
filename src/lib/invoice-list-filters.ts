import type { InvoiceStatus, Prisma } from "@/generated/prisma/client";

export type PayPeriodFilterOption = {
  id: string;
  label: string;
};

export type TherapistFilterOption = {
  id: string;
  label: string;
};

export type InvoicePaymentFilter = "PAID" | "UNPAID";

export type AdminInvoiceFilterValues = {
  status?: InvoiceStatus;
  therapistId?: string;
  payPeriodId?: string;
  paymentStatus?: InvoicePaymentFilter;
};

export type TherapistInvoiceFilterValues = {
  status?: InvoiceStatus;
  payPeriodId?: string;
  paymentStatus?: InvoicePaymentFilter;
};

export const INVOICE_PAYMENT_FILTER_OPTIONS = [
  { value: "", label: "All payments" },
  { value: "PAID", label: "Paid" },
  { value: "UNPAID", label: "Unpaid" },
] as const;

export function buildAdminInvoicesHref(values: AdminInvoiceFilterValues): string {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.therapistId) params.set("therapistId", values.therapistId);
  if (values.payPeriodId) params.set("payPeriodId", values.payPeriodId);
  if (values.paymentStatus) params.set("paymentStatus", values.paymentStatus);
  const query = params.toString();
  return query ? `/portal/admin/invoices?${query}` : "/portal/admin/invoices";
}

export function buildTherapistInvoicesHref(values: TherapistInvoiceFilterValues): string {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.payPeriodId) params.set("payPeriodId", values.payPeriodId);
  if (values.paymentStatus) params.set("paymentStatus", values.paymentStatus);
  const query = params.toString();
  return query ? `/portal/therapist/invoices?${query}` : "/portal/therapist/invoices";
}

export function isInvoicePaymentFilter(value: string | undefined): value is InvoicePaymentFilter {
  return value === "PAID" || value === "UNPAID";
}

export function invoicePaymentWhere(
  paymentStatus: InvoicePaymentFilter | undefined,
): Prisma.InvoiceWhereInput | undefined {
  if (!paymentStatus) return undefined;
  return { paymentStatus };
}

export function invoicePayPeriodWhere(
  payPeriodId: string | undefined,
): Prisma.InvoiceWhereInput | undefined {
  if (!payPeriodId) return undefined;
  if (payPeriodId === "none") {
    return { payPeriodId: null };
  }
  return {
    OR: [{ payPeriodId }, { bill: { payPeriodId } }],
  };
}

export function mergeInvoiceWhere(
  base: Prisma.InvoiceWhereInput,
  extra?: Prisma.InvoiceWhereInput,
): Prisma.InvoiceWhereInput {
  if (!extra) return base;
  return { AND: [base, extra] };
}
