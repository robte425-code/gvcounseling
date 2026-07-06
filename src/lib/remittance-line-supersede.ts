import { calendarIsoFromDate } from "@/lib/constants";
import { getNextInvoiceNumber } from "@/lib/invoice-numbers";
import type { RemittanceServiceLine } from "@/lib/parse-lni-remittance-pdf";
import { rematchRemittanceAdvice } from "@/lib/remittance-advice";
import { prisma } from "@/lib/prisma";

export type RemittanceLineResolution = {
  matchedInvoiceId: string | null;
  supersededAt: Date | null;
};

/** Lines that still block applying a preview remittance. */
export function isUnresolvedRemittanceLine(line: RemittanceLineResolution): boolean {
  return !line.matchedInvoiceId && !line.supersededAt;
}

export function countUnresolvedRemittanceLines(lines: RemittanceLineResolution[]): number {
  return lines.filter(isUnresolvedRemittanceLine).length;
}

export type RemittanceBillSummary = {
  paid: number;
  denied: number;
  inProcess: number;
  superseded: number;
  unresolved: number;
};

type RemittanceLineForSummary = RemittanceLineResolution & {
  section: "PAID" | "DENIED" | "IN_PROCESS";
};

export function summarizeRemittanceBillCounts(
  lines: RemittanceLineForSummary[],
): RemittanceBillSummary {
  const summary: RemittanceBillSummary = {
    paid: 0,
    denied: 0,
    inProcess: 0,
    superseded: 0,
    unresolved: 0,
  };

  for (const line of lines) {
    if (line.supersededAt) {
      summary.superseded += 1;
      continue;
    }
    if (!line.matchedInvoiceId) summary.unresolved += 1;
    switch (line.section) {
      case "PAID":
        summary.paid += 1;
        break;
      case "DENIED":
        summary.denied += 1;
        break;
      case "IN_PROCESS":
        summary.inProcess += 1;
        break;
    }
  }

  return summary;
}

export function getRemittanceLineServiceDates(serviceLines: unknown): string[] {
  if (!Array.isArray(serviceLines)) return [];
  return [
    ...new Set(
      serviceLines
        .map((line) => (line as RemittanceServiceLine).serviceDateFrom)
        .filter((date): date is string => typeof date === "string" && date.length > 0),
    ),
  ].sort();
}

function shiftIsoYear(isoDate: string, yearDelta: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  const shiftedYear = year! + yearDelta;
  return `${shiftedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type WrongYearSupersedeSuggestion = {
  lineId: string;
  claimNumber: string;
  raServiceDates: string[];
  correctedServiceDates: string[];
  invoiceId: string;
  invoiceNumber: number;
  note: string;
};

type RemittanceLineForDetection = {
  id: string;
  claimNumber: string;
  section: string;
  matchedInvoiceId: string | null;
  supersededAt: Date | null;
  serviceLines: unknown;
};

async function findBilledInvoiceForCorrectedDates(
  claimNumber: string,
  correctedDates: string[],
): Promise<{ id: string; invoiceNumber: number } | null> {
  if (correctedDates.length === 0) return null;

  const invoices = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      client: { lniClaimNumber: claimNumber },
      lineItems: {
        some: {
          serviceDate: {
            in: correctedDates.map((date) => new Date(`${date}T00:00:00.000Z`)),
          },
        },
      },
    },
    select: { id: true, invoiceNumber: true, lineItems: { select: { serviceDate: true } } },
    orderBy: { invoiceNumber: "asc" },
  });

  for (const invoice of invoices) {
    const invoiceDates = new Set(
      invoice.lineItems.map((line) => calendarIsoFromDate(line.serviceDate)),
    );
    if (correctedDates.every((date) => invoiceDates.has(date))) {
      return { id: invoice.id, invoiceNumber: invoice.invoiceNumber };
    }
  }

  return null;
}

/** Detect stale wrong-year RA lines that have a resubmitted invoice one year later. */
export async function detectWrongYearSupersedeSuggestion(
  line: RemittanceLineForDetection,
): Promise<WrongYearSupersedeSuggestion | null> {
  if (line.matchedInvoiceId || line.supersededAt) return null;
  if (line.section === "PAID") return null;

  const raDates = getRemittanceLineServiceDates(line.serviceLines);
  if (raDates.length === 0) return null;

  const correctedDates = raDates.map((date) => shiftIsoYear(date, 1));
  const invoice = await findBilledInvoiceForCorrectedDates(line.claimNumber, correctedDates);
  if (!invoice) return null;

  const raLabel = raDates.join(", ");
  const correctedLabel = correctedDates.join(", ");

  return {
    lineId: line.id,
    claimNumber: line.claimNumber,
    raServiceDates: raDates,
    correctedServiceDates: correctedDates,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    note: `Wrong-year submission: L&I shows ${raLabel} but invoice #${invoice.invoiceNumber} has ${correctedLabel} (resubmitted).`,
  };
}

export async function listWrongYearSupersedeSuggestions(
  remittanceAdviceId: string,
): Promise<WrongYearSupersedeSuggestion[]> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: { lines: true },
  });
  if (!remittance) throw new Error("Remittance advice not found.");

  const suggestions: WrongYearSupersedeSuggestion[] = [];
  for (const line of remittance.lines) {
    const suggestion = await detectWrongYearSupersedeSuggestion(line);
    if (suggestion) suggestions.push(suggestion);
  }
  return suggestions;
}

export async function supersedeRemittanceLine(
  lineId: string,
  note?: string,
): Promise<void> {
  const line = await prisma.remittanceAdviceLine.findUnique({
    where: { id: lineId },
    include: { remittanceAdvice: { select: { status: true } } },
  });
  if (!line) throw new Error("Remittance line not found.");
  if (line.remittanceAdvice.status !== "PREVIEW") {
    throw new Error("Only preview remittance lines can be superseded.");
  }
  if (line.matchedInvoiceId) {
    throw new Error("Matched lines cannot be superseded.");
  }

  await prisma.remittanceAdviceLine.update({
    where: { id: lineId },
    data: {
      supersededAt: new Date(),
      supersedeNote: note?.trim() || "Superseded stale line.",
    },
  });
}

export async function unsupersedeRemittanceLine(lineId: string): Promise<void> {
  const line = await prisma.remittanceAdviceLine.findUnique({
    where: { id: lineId },
    include: { remittanceAdvice: { select: { status: true } } },
  });
  if (!line) throw new Error("Remittance line not found.");
  if (line.remittanceAdvice.status !== "PREVIEW") {
    throw new Error("Only preview remittance lines can be unsuperseded.");
  }

  await prisma.remittanceAdviceLine.update({
    where: { id: lineId },
    data: { supersededAt: null, supersedeNote: null },
  });
}

export async function supersedeWrongYearStaleLines(remittanceAdviceId: string): Promise<number> {
  const suggestions = await listWrongYearSupersedeSuggestions(remittanceAdviceId);
  for (const suggestion of suggestions) {
    await supersedeRemittanceLine(suggestion.lineId, suggestion.note);
  }
  return suggestions.length;
}

type LineItemInput = {
  procedureCode: string;
  serviceDate: Date;
  amount: number;
  units: number;
  sortOrder: number;
};

function lineItemSignature(lineItems: LineItemInput[]): string {
  return [...lineItems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (li) =>
        `${li.procedureCode}:${calendarIsoFromDate(li.serviceDate)}:${li.amount}:${li.units}`,
    )
    .join("|");
}

async function findExistingRebillDuplicate(
  clientId: string,
  excludeInvoiceId: string,
  signature: string,
): Promise<{ id: string; invoiceNumber: number } | null> {
  const candidates = await prisma.invoice.findMany({
    where: {
      clientId,
      id: { not: excludeInvoiceId },
      status: "BILLED",
      submittedAt: null,
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  for (const candidate of candidates) {
    const candidateSignature = lineItemSignature(
      candidate.lineItems.map((li) => ({
        procedureCode: li.procedureCode,
        serviceDate: li.serviceDate,
        amount: Number(li.amount),
        units: li.units,
        sortOrder: li.sortOrder,
      })),
    );
    if (candidateSignature === signature) {
      return { id: candidate.id, invoiceNumber: candidate.invoiceNumber };
    }
  }
  return null;
}

export type WrongYearRebillResult = {
  created: boolean;
  invoiceNumber: number;
  message: string;
};

/** Clone the corrected-year source invoice as an unsubmitted rebill for L&I resubmission. */
export async function createWrongYearRebillFromLine(lineId: string): Promise<WrongYearRebillResult> {
  const line = await prisma.remittanceAdviceLine.findUnique({
    where: { id: lineId },
    include: { remittanceAdvice: { select: { id: true, status: true } } },
  });
  if (!line) throw new Error("Remittance line not found.");
  if (line.remittanceAdvice.status !== "PREVIEW") {
    throw new Error("Only preview remittance lines can create rebills.");
  }

  const suggestion = await detectWrongYearSupersedeSuggestion(line);
  if (!suggestion) {
    throw new Error("This line is not a detected wrong-year stale line.");
  }

  const source = await prisma.invoice.findUnique({
    where: { id: suggestion.invoiceId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) throw new Error(`Source invoice #${suggestion.invoiceNumber} not found.`);

  const lineItems: LineItemInput[] = source.lineItems.map((li) => ({
    procedureCode: li.procedureCode,
    serviceDate: li.serviceDate,
    amount: Number(li.amount),
    units: li.units,
    sortOrder: li.sortOrder,
  }));
  const signature = lineItemSignature(lineItems);

  const duplicate = await findExistingRebillDuplicate(source.clientId, source.id, signature);
  if (duplicate) {
    return {
      created: false,
      invoiceNumber: duplicate.invoiceNumber,
      message: `Rebill already exists: #${duplicate.invoiceNumber}`,
    };
  }

  const nextNumber = await getNextInvoiceNumber(prisma, source.therapistId);
  await prisma.invoice.create({
    data: {
      therapistId: source.therapistId,
      clientId: source.clientId,
      invoiceNumber: nextNumber,
      status: "BILLED",
      paymentStatus: "UNPAID",
      lniPaidAt: null,
      lniEobCodes: [],
      lniEobCodeDescriptions: {},
      totalAmount: Number(source.totalAmount),
      billedAt: source.billedAt,
      submittedAt: null,
      payPeriodId: null,
      lineItems: {
        create: lineItems.map((item) => ({
          serviceDate: item.serviceDate,
          procedureCode: item.procedureCode,
          amount: item.amount,
          units: item.units,
          sortOrder: item.sortOrder,
        })),
      },
    },
  });

  await rematchRemittanceAdvice(line.remittanceAdvice.id);

  const dos = suggestion.correctedServiceDates.join(", ");
  return {
    created: true,
    invoiceNumber: nextNumber,
    message: `Created rebill #${nextNumber} from #${suggestion.invoiceNumber} (DOS ${dos}).`,
  };
}

export async function createWrongYearRebillsForRemittance(
  remittanceAdviceId: string,
): Promise<{ created: number; skipped: number; results: WrongYearRebillResult[] }> {
  const suggestions = await listWrongYearSupersedeSuggestions(remittanceAdviceId);
  if (suggestions.length === 0) {
    throw new Error("No wrong-year stale lines detected to rebill.");
  }

  const results: WrongYearRebillResult[] = [];
  let created = 0;
  let skipped = 0;

  for (const suggestion of suggestions) {
    const result = await createWrongYearRebillFromLine(suggestion.lineId);
    results.push(result);
    if (result.created) created += 1;
    else skipped += 1;
  }

  return { created, skipped, results };
}
