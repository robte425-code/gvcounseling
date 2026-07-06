import type { PaymentStatus } from "@/generated/prisma/client";
import type { RemittanceBillSection } from "@/lib/parse-lni-remittance-pdf";

export type InferredPayment = {
  paymentStatus: PaymentStatus;
  lniPaidAt: Date | null;
};

/** L&I remittance section → invoice `paymentStatus` (same enum values). */
export function remittanceSectionToPaymentStatus(section: RemittanceBillSection): PaymentStatus {
  switch (section) {
    case "PAID":
    case "DENIED":
    case "IN_PROCESS":
      return section;
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case "DENIED":
      return "Denied";
    case "IN_PROCESS":
      return "In process";
    case "UNPAID":
      return "Unpaid";
    case "APPEAL_IN_PROGRESS":
      return "Appeal in progress";
  }
}

export function remittanceSectionLabel(section: RemittanceBillSection): string {
  return paymentStatusLabel(remittanceSectionToPaymentStatus(section));
}

export function paymentUpdateFromRemittance(
  section: RemittanceBillSection,
  remittancePaymentDate: Date,
): InferredPayment {
  const paymentStatus = remittanceSectionToPaymentStatus(section);
  return {
    paymentStatus,
    lniPaidAt: paymentStatus === "PAID" ? remittancePaymentDate : null,
  };
}

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
    return { paymentStatus: "IN_PROCESS", lniPaidAt: null };
  }

  return { paymentStatus: "UNPAID", lniPaidAt: null };
}
