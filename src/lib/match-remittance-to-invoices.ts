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
  const billSet = new Set(billKeys);
  let overlap = 0;
  for (const key of invoiceKeys) {
    if (billSet.has(key)) overlap += 1;
  }
  return overlap / Math.max(billKeys.length, invoiceKeys.length);
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
    const billKeys = billLineKeys(bill);
    const providerId = normalizeLniProviderId(bill.serviceProviderId);

    const candidates = invoices.filter((invoice) => {
      if (usedInvoiceIds.has(invoice.id)) return false;
      if (invoice.client.lniClaimNumber !== bill.claimNumber) return false;
      const therapistProvider = invoice.therapist.lniProviderId
        ? normalizeLniProviderId(invoice.therapist.lniProviderId)
        : null;
      return therapistProvider === providerId;
    });

    let best: (typeof invoices)[number] | null = null;
    let bestScore = 0;

    for (const invoice of candidates) {
      const score = lineOverlapScore(billKeys, invoiceLineKeys(invoice.lineItems));
      if (score > bestScore) {
        bestScore = score;
        best = invoice;
      }
    }

    if (!best || bestScore < 0.5) {
      return {
        bill,
        matchedInvoiceId: null,
        matchNote:
          candidates.length === 0
            ? `No billed invoice for claim ${bill.claimNumber} / provider ${bill.serviceProviderId}`
            : `No invoice matched service lines (${(bestScore * 100).toFixed(0)}% overlap)`,
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
