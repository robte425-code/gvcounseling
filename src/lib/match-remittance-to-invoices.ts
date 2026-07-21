import type { PaymentStatus } from "@/generated/prisma/client";
import { calendarIsoFromDate } from "@/lib/constants";
import { remittanceSectionToPaymentStatus } from "@/lib/invoice-payment-status";
import { normalizeLniProviderId } from "@/lib/parse-lni-remittance-pdf";
import type { RemittanceBill } from "@/lib/parse-lni-remittance-pdf";
import { prisma } from "@/lib/prisma";

export type MatchedRemittanceBill = {
  bill: RemittanceBill;
  matchedInvoiceId: string | null;
  matchNote: string | null;
  paymentStatus: PaymentStatus;
};

function serviceLineKey(procedureCode: string, serviceDate: string): string {
  return `${procedureCode}:${serviceDate}`;
}

function billLineKeys(bill: RemittanceBill): string[] {
  return bill.serviceLines.map((line) =>
    serviceLineKey(line.procedureCode, line.serviceDateFrom),
  );
}

function invoiceLineKeys(
  lineItems: Array<{ procedureCode: string; serviceDate: Date }>,
): string[] {
  return lineItems.map((line) =>
    serviceLineKey(line.procedureCode, calendarIsoFromDate(line.serviceDate)),
  );
}

function lineOverlapScore(billKeys: string[], invoiceKeys: string[]): number {
  if (billKeys.length === 0 || invoiceKeys.length === 0) return 0;
  const invoiceSet = new Set(invoiceKeys);
  let overlap = 0;
  for (const key of billKeys) {
    if (invoiceSet.has(key)) overlap += 1;
  }
  // RA bills are usually a subset of the billed invoice's service lines.
  return overlap / billKeys.length;
}

function billServiceDates(bill: RemittanceBill): string[] {
  return [...new Set(bill.serviceLines.map((line) => line.serviceDateFrom))];
}

function invoiceServiceDates(
  lineItems: Array<{ serviceDate: Date }>,
): string[] {
  return [...new Set(lineItems.map((line) => calendarIsoFromDate(line.serviceDate)))];
}

function dateOverlapScore(billDates: string[], invoiceDates: string[]): number {
  if (billDates.length === 0 || invoiceDates.length === 0) return 0;
  const invoiceSet = new Set(invoiceDates);
  let overlap = 0;
  for (const date of billDates) {
    if (invoiceSet.has(date)) overlap += 1;
  }
  return overlap / billDates.length;
}

const MAX_SERVICE_DATE_TOLERANCE_DAYS = 7;
const MIN_NEAR_DATE_MATCH_SCORE = 1 - MAX_SERVICE_DATE_TOLERANCE_DAYS / 100;

function calendarDayDistance(isoA: string, isoB: string): number {
  const [yearA, monthA, dayA] = isoA.split("-").map(Number);
  const [yearB, monthB, dayB] = isoB.split("-").map(Number);
  const a = Date.UTC(yearA!, monthA! - 1, dayA!);
  const b = Date.UTC(yearB!, monthB! - 1, dayB!);
  return Math.abs(Math.round((a - b) / 86_400_000));
}

function nearestServiceDateDistance(billDates: string[], invoiceDates: string[]): number {
  let nearest = Infinity;
  for (const billDate of billDates) {
    for (const invoiceDate of invoiceDates) {
      nearest = Math.min(nearest, calendarDayDistance(billDate, invoiceDate));
    }
  }
  return nearest;
}

function dateMatchScore(
  billDates: string[],
  invoiceDates: string[],
): { score: number; note: string | null } {
  if (dateOverlapScore(billDates, invoiceDates) >= 1) {
    return { score: 1, note: null };
  }

  const nearestDays = nearestServiceDateDistance(billDates, invoiceDates);
  if (nearestDays <= MAX_SERVICE_DATE_TOLERANCE_DAYS) {
    return {
      score: 1 - nearestDays / 100,
      note: `Matched nearest service date (${nearestDays} day${nearestDays === 1 ? "" : "s"} off)`,
    };
  }

  return { score: 0, note: null };
}

function matchScore(
  bill: RemittanceBill,
  invoice: { lineItems: Array<{ procedureCode: string; serviceDate: Date }> },
): { score: number; note: string | null } {
  const billKeys = billLineKeys(bill);
  const invoiceKeys = invoiceLineKeys(invoice.lineItems);
  const procedureScore = lineOverlapScore(billKeys, invoiceKeys);
  const billDates = billServiceDates(bill);
  const invoiceDates = invoiceServiceDates(invoice.lineItems);
  const dateMatch = dateMatchScore(billDates, invoiceDates);

  if (dateMatch.score >= 1) {
    return { score: 1 + procedureScore * 0.01, note: null };
  }
  if (dateMatch.score >= MIN_NEAR_DATE_MATCH_SCORE) {
    return { score: dateMatch.score + procedureScore * 0.001, note: dateMatch.note };
  }
  return { score: procedureScore, note: null };
}

export async function matchRemittanceBills(
  bills: RemittanceBill[],
  options?: { reservedInvoiceIds?: Iterable<string> },
): Promise<MatchedRemittanceBill[]> {
  const claimNumbers = [...new Set(bills.map((bill) => bill.claimNumber))];
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      client: { lniClaimNumber: { in: claimNumbers } },
    },
    include: {
      client: { select: { lniClaimNumber: true } },
      therapist: { select: { id: true, lniProviderId: true, firstName: true, lastName: true } },
      lineItems: { select: { procedureCode: true, serviceDate: true, amount: true } },
    },
  });

  const usedInvoiceIds = new Set<string>(options?.reservedInvoiceIds ?? []);

  return bills.map((bill) => {
    const providerId = bill.serviceProviderId
      ? normalizeLniProviderId(bill.serviceProviderId)
      : "";

    const claimInvoices = invoices.filter(
      (invoice) => invoice.client.lniClaimNumber === bill.claimNumber,
    );

    const providerMatchedInvoices = providerId
      ? claimInvoices.filter((invoice) => {
          const therapistProvider = invoice.therapist.lniProviderId
            ? normalizeLniProviderId(invoice.therapist.lniProviderId)
            : null;
          return therapistProvider === providerId;
        })
      : claimInvoices;

    // L&I remittance lines sometimes list a different provider id than the therapist
    // who owns the claim in our system; fall back to claim + service date matching.
    const candidates =
      providerMatchedInvoices.length > 0 ? providerMatchedInvoices : claimInvoices;

    const pickBest = (pool: typeof invoices) => {
      let best: (typeof invoices)[number] | null = null;
      let bestScore = 0;
      let bestNote: string | null = null;
      for (const invoice of pool) {
        const { score, note } = matchScore(bill, invoice);
        if (score > bestScore) {
          bestScore = score;
          best = invoice;
          bestNote = note;
        }
      }
      return { best, bestScore, bestNote };
    };

    let { best, bestScore, bestNote } = pickBest(
      candidates.filter((invoice) => !usedInvoiceIds.has(invoice.id)),
    );

    if (!best || bestScore < MIN_NEAR_DATE_MATCH_SCORE) {
      ({ best, bestScore, bestNote } = pickBest(candidates));
    }

    if (
      best &&
      bestScore >= MIN_NEAR_DATE_MATCH_SCORE &&
      providerId &&
      providerMatchedInvoices.length === 0
    ) {
      bestNote = bestNote
        ? `${bestNote}; RA provider ${bill.serviceProviderId} differed from therapist`
        : `Matched by claim/service date; RA provider ${bill.serviceProviderId} differed from therapist`;
    }

    if (!best || bestScore < MIN_NEAR_DATE_MATCH_SCORE) {
      return {
        bill,
        matchedInvoiceId: null,
        matchNote:
          claimInvoices.length === 0
            ? providerId
              ? `No billed invoice for claim ${bill.claimNumber} / provider ${bill.serviceProviderId}`
              : `No billed invoice for claim ${bill.claimNumber}`
            : `No invoice matched service date/lines (${(bestScore * 100).toFixed(0)}% score)`,
        paymentStatus: remittanceSectionToPaymentStatus(bill.section),
      };
    }

    usedInvoiceIds.add(best.id);
    return {
      bill,
      matchedInvoiceId: best.id,
      matchNote: bestNote,
      paymentStatus: remittanceSectionToPaymentStatus(bill.section),
    };
  });
}
