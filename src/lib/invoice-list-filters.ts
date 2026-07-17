import type { InvoiceStatus, PaymentStatus, Prisma } from "@/generated/prisma/client";

export type PayPeriodFilterOption = {
  id: string;
  label: string;
};

export type TherapistFilterOption = {
  id: string;
  label: string;
};

export type InvoicePaymentFilter = PaymentStatus;

export type AdminInvoiceFilterValues = {
  status?: InvoiceStatus;
  therapistId?: string;
  payPeriodId?: string;
  paymentStatus?: InvoicePaymentFilter;
  invoiceNumber?: number;
};

export type TherapistInvoiceFilterValues = {
  status?: InvoiceStatus;
  payPeriodId?: string;
  paymentStatus?: InvoicePaymentFilter;
  invoiceNumber?: number;
};

export const INVOICE_PAYMENT_FILTER_OPTIONS = [
  { value: "", label: "All L&I statuses" },
  { value: "PAID", label: "Paid" },
  { value: "DENIED", label: "Denied" },
  { value: "IN_PROCESS", label: "In process" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "APPEAL_IN_PROGRESS", label: "Appeal in progress" },
] as const;

export function buildAdminInvoicesHref(values: AdminInvoiceFilterValues): string {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.therapistId) params.set("therapistId", values.therapistId);
  if (values.payPeriodId) params.set("payPeriodId", values.payPeriodId);
  if (values.paymentStatus) params.set("paymentStatus", values.paymentStatus);
  if (values.invoiceNumber) params.set("invoiceNumber", String(values.invoiceNumber));
  const query = params.toString();
  return query ? `/portal/admin/invoices?${query}` : "/portal/admin/invoices";
}

export function buildTherapistInvoicesHref(values: TherapistInvoiceFilterValues): string {
  const params = new URLSearchParams();
  if (values.status) params.set("status", values.status);
  if (values.payPeriodId) params.set("payPeriodId", values.payPeriodId);
  if (values.paymentStatus) params.set("paymentStatus", values.paymentStatus);
  if (values.invoiceNumber) params.set("invoiceNumber", String(values.invoiceNumber));
  const query = params.toString();
  return query ? `/portal/therapist/invoices?${query}` : "/portal/therapist/invoices";
}

import {
  PORTAL_THERAPIST_INVOICE_RETURN_PREFIXES,
  sanitizePortalReturnTo,
} from "@/lib/sanitize-portal-return-to";

/** Safe redirect target after therapist invoice mutations (list filters preserved). */
export function parseTherapistInvoicesReturnTo(value: string | undefined): string {
  return sanitizePortalReturnTo(value, {
    fallback: "/portal/therapist/invoices",
    allowedPrefixes: PORTAL_THERAPIST_INVOICE_RETURN_PREFIXES,
  });
}

export function isInvoicePaymentFilter(value: string | undefined): value is InvoicePaymentFilter {
  return (
    value === "PAID" ||
    value === "DENIED" ||
    value === "IN_PROCESS" ||
    value === "UNPAID" ||
    value === "APPEAL_IN_PROGRESS"
  );
}

export function parseInvoiceNumberFilter(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function invoiceNumberWhere(
  invoiceNumber: number | undefined,
): Prisma.InvoiceWhereInput | undefined {
  if (!invoiceNumber) return undefined;
  return { invoiceNumber };
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
  return { payPeriodId };
}

export function mergeInvoiceWhere(
  base: Prisma.InvoiceWhereInput,
  extra?: Prisma.InvoiceWhereInput,
): Prisma.InvoiceWhereInput {
  if (!extra) return base;
  return { AND: [base, extra] };
}

/** Invoices on a pay period eligible for 837 generation (submitted only — not already billed). */
export function invoice837PayPeriodWhere(payPeriodId: string): Prisma.InvoiceWhereInput {
  return {
    payPeriodId,
    status: "SUBMITTED",
  };
}
