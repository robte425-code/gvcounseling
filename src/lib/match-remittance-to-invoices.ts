import type { PaymentStatus } from "@/generated/prisma/client";
import { calendarIsoFromDate } from "@/lib/constants";
import { normalizeLniProviderId } from "@/lib/parse-lni-remittance-pdf";
import type { RemittanceBill, RemittanceBillSection } from "@/lib/parse-lni-remittance-pdf";
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

export function remittanceSectionToPaymentStatus(section: RemittanceBillSection): PaymentStatus {
  switch (section) {
    case "PAID":
      return "PAID";
    case "DENIED":
      return "DENIED";
    case "IN_PROCESS":
      return "UNPAID";
  }
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

function matchScore(bill: RemittanceBill, invoice: { lineItems: Array<{ procedureCode: string; serviceDate: Date }> }): number {
  const billKeys = billLineKeys(bill);
  const invoiceKeys = invoiceLineKeys(invoice.lineItems);
  const procedureScore = lineOverlapScore(billKeys, invoiceKeys);
  const dateScore = dateOverlapScore(billServiceDates(bill), invoiceServiceDates(invoice.lineItems));

  // Therapist invoices are usually one billed session per date; L&I may show different
  // procedure codes than we submitted (e.g. 96156 vs 96158, 90834 vs 90837).
  if (dateScore >= 1) {
    return 1 + procedureScore * 0.01;
  }
  return procedureScore;
}

export async function matchRemittanceBills(
  bills: RemittanceBill[],
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

  const usedInvoiceIds = new Set<string>();

  return bills.map((bill) => {
    const providerId = bill.serviceProviderId
      ? normalizeLniProviderId(bill.serviceProviderId)
      : "";

    const candidates = invoices.filter((invoice) => {
      if (invoice.client.lniClaimNumber !== bill.claimNumber) return false;
      if (!providerId) return true;
      const therapistProvider = invoice.therapist.lniProviderId
        ? normalizeLniProviderId(invoice.therapist.lniProviderId)
        : null;
      return therapistProvider === providerId;
    });

    const pickBest = (pool: typeof invoices) => {
      let best: (typeof invoices)[number] | null = null;
      let bestScore = 0;
      for (const invoice of pool) {
        const score = matchScore(bill, invoice);
        if (score > bestScore) {
          bestScore = score;
          best = invoice;
        }
      }
      return { best, bestScore };
    };

    let { best, bestScore } = pickBest(
      candidates.filter((invoice) => !usedInvoiceIds.has(invoice.id)),
    );

    if (!best || bestScore < 1) {
      ({ best, bestScore } = pickBest(candidates));
    }

    if (!best || bestScore < 1) {
      return {
        bill,
        matchedInvoiceId: null,
        matchNote:
          candidates.length === 0
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
      matchNote: null,
      paymentStatus: remittanceSectionToPaymentStatus(bill.section),
    };
  });
}
