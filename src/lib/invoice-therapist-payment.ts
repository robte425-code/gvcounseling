import type { TherapistPayRunStatus } from "@/generated/prisma/client";

export type TherapistPaymentDisplay = "none" | "pending" | "paid";

/** Include on invoice queries to derive therapist payment display. */
export const invoiceTherapistPayRunLinesInclude = {
  payRunLines: {
    select: {
      id: true,
      payout: { select: { payRun: { select: { status: true } } } },
    },
  },
} as const;

export type InvoiceTherapistPayRunLine = {
  payout: { payRun: { status: TherapistPayRunStatus } };
};

/** Paid only after admin finalizes the pay run; pending when in a draft pay run. */
export function resolveTherapistPaymentDisplay(
  lines: InvoiceTherapistPayRunLine[],
): TherapistPaymentDisplay {
  if (lines.some((line) => line.payout.payRun.status === "FINALIZED")) return "paid";
  if (lines.length > 0) return "pending";
  return "none";
}

export function therapistPaymentLabel(display: TherapistPaymentDisplay): string {
  switch (display) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    default:
      return "Unpaid";
  }
}

export function therapistPaymentFromPayRunLines(
  lines: InvoiceTherapistPayRunLine[],
): TherapistPaymentDisplay {
  return resolveTherapistPaymentDisplay(lines);
}
