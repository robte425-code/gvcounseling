import type { Prisma } from "@/generated/prisma/client";

export type PayPeriodFilterOption = {
  id: string;
  label: string;
};

export type InvoicePaymentFilter = "PAID" | "UNPAID";

export const INVOICE_PAYMENT_FILTER_OPTIONS = [
  { value: "", label: "All payments" },
  { value: "PAID", label: "Paid" },
  { value: "UNPAID", label: "Unpaid" },
] as const;

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
