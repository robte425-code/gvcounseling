import type { PaymentStatus } from "@/generated/prisma/client";

export type InferredPayment = {
  paymentStatus: PaymentStatus;
  lniPaidAt: Date | null;
};

/**
 * Map spreadsheet "LNI Payment" column to PaymentStatus.
 *
 * Column 11 ("LNI Paid") may contain expected warrant dates before L&I verifies
 * payment — it must not mark an invoice paid on its own. Only explicit values in
 * "LNI Payment" (e.g. "Verified") mean paid.
 */
export function inferPaymentStatusFromSpreadsheet(
  lniPaid: Date | null,
  lniPayment: string,
): InferredPayment {
  const pay = lniPayment.trim();

  if (/denied/i.test(pay)) {
    return { paymentStatus: "DENIED", lniPaidAt: lniPaid };
  }

  if (/^verified/i.test(pay) || pay === "Verified on 12/24/24 bill") {
    return { paymentStatus: "PAID", lniPaidAt: lniPaid };
  }

  if (/not paid/i.test(pay) || pay === "MISSING") {
    return { paymentStatus: "UNPAID", lniPaidAt: null };
  }

  if (/in process/i.test(pay) || /action is being taken/i.test(pay)) {
    return { paymentStatus: "UNPAID", lniPaidAt: null };
  }

  return { paymentStatus: "UNPAID", lniPaidAt: null };
}
