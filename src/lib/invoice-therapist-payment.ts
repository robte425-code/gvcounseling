import type { TherapistPayRunStatus } from "@/generated/prisma/client";
import { resolveFeeAmount, type FeeScheduleRow } from "@/lib/procedure-fee-schedule";

export type TherapistPaymentDisplay = "none" | "pending" | "paid";

export type InvoiceLineForTherapistPay = {
  procedureCode: string;
  serviceDate: Date;
  units: number;
  amount?: unknown;
};

/** Include on invoice queries to derive therapist payment display and amounts. */
export const invoiceTherapistPayRunLinesInclude = {
  payRunLines: {
    select: {
      id: true,
      therapistAmount: true,
      payout: { select: { payRun: { select: { status: true } } } },
    },
  },
} as const;

export type InvoiceTherapistPayRunLine = {
  therapistAmount?: unknown;
  payout: { payRun: { status: TherapistPayRunStatus } };
};

export type TherapistPaymentInfo = {
  display: TherapistPaymentDisplay;
  /** Amount from pay run line(s) when in a pay run; null when not yet in a pay run. */
  payRunAmount: number | null;
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

function sumPayRunLineAmounts(
  lines: InvoiceTherapistPayRunLine[],
  statuses: TherapistPayRunStatus[],
): number {
  return Math.round(
    lines
      .filter((line) => statuses.includes(line.payout.payRun.status))
      .reduce((sum, line) => sum + Number(line.therapistAmount ?? 0), 0) * 100,
  ) / 100;
}

export function resolveTherapistPaymentInfo(
  lines: InvoiceTherapistPayRunLine[],
): TherapistPaymentInfo {
  const display = resolveTherapistPaymentDisplay(lines);
  if (display === "none") {
    return { display, payRunAmount: null };
  }
  if (display === "paid") {
    const payRunAmount = sumPayRunLineAmounts(lines, ["FINALIZED"]);
    return { display, payRunAmount: payRunAmount > 0 ? payRunAmount : null };
  }
  const payRunAmount = sumPayRunLineAmounts(lines, ["DRAFT"]);
  return { display, payRunAmount: payRunAmount > 0 ? payRunAmount : null };
}

export function therapistPaymentFromPayRunLines(
  lines: InvoiceTherapistPayRunLine[],
): TherapistPaymentDisplay {
  return resolveTherapistPaymentDisplay(lines);
}

/**
 * Therapist pay for remittance apply: use stored invoice line amounts (what the
 * therapist submitted), falling back to the fee schedule for legacy imports.
 */
export function computeTherapistPayAmountForInvoice(
  invoice: {
    lineItems: InvoiceLineForTherapistPay[];
    totalAmount?: unknown;
  },
  feeRows: FeeScheduleRow[],
): number {
  if (invoice.lineItems.length === 0) {
    const total = Number(invoice.totalAmount);
    return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0;
  }

  let storedSum = 0;
  let useStored = true;
  for (const line of invoice.lineItems) {
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      useStored = false;
      break;
    }
    storedSum += amount;
  }

  if (useStored && storedSum > 0) {
    return Math.round(storedSum * 100) / 100;
  }

  let fromFees = 0;
  for (const line of invoice.lineItems) {
    const unitFee = resolveFeeAmount(feeRows, line.procedureCode, line.serviceDate);
    if (unitFee === null) {
      throw new Error(`Missing therapist fee for ${line.procedureCode}.`);
    }
    fromFees += unitFee * line.units;
  }
  return Math.round(fromFees * 100) / 100;
}
