import type { Prisma } from "@/generated/prisma/client";
import { paymentUpdateFromRemittance, remittanceSectionToPaymentStatus } from "@/lib/invoice-payment-status";
import { matchRemittanceBills } from "@/lib/match-remittance-to-invoices";
import type { MatchedRemittanceBill } from "@/lib/match-remittance-to-invoices";
import { countUnresolvedRemittanceLines } from "@/lib/remittance-line-supersede";
import { parseLniRemittancePdf } from "@/lib/parse-lni-remittance-pdf";
import type { ParsedRemittanceAdvice, RemittanceBill, RemittanceServiceLine } from "@/lib/parse-lni-remittance-pdf";
import { resolveEobDescriptions } from "@/lib/parse-lni-remittance-pdf";
import { resolveFeeAmount } from "@/lib/procedure-fee-schedule";
import { prisma } from "@/lib/prisma";

function parseRaDate(value: string): Date {
  const [month, day, year] = value.split("/").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year!, month! - 1, day!));
}

export type TherapistPayPreview = {
  therapistId: string;
  therapistName: string;
  invoiceCount: number;
  lniPaidAmount: number;
  therapistAmount: number;
  lines: Array<{
    invoiceId: string;
    invoiceNumber: number;
    claimNumber: string;
    lniPaidAmount: number;
    therapistAmount: number;
  }>;
};

export async function computeTherapistAmountForInvoice(
  invoice: {
    therapistId: string;
    lineItems: Array<{ procedureCode: string; serviceDate: Date; units: number }>;
  },
  feeRows: Array<{
    procedureCode: string;
    amount: unknown;
    effectiveFrom: Date | string;
    effectiveTo: Date | string | null;
  }>,
): Promise<number> {
  let total = 0;
  for (const line of invoice.lineItems) {
    const unitFee = resolveFeeAmount(feeRows, line.procedureCode, line.serviceDate);
    if (unitFee === null) {
      throw new Error(`Missing therapist fee for ${line.procedureCode}.`);
    }
    total += unitFee * line.units;
  }
  return Math.round(total * 100) / 100;
}

export async function buildTherapistPayPreview(
  matches: MatchedRemittanceBill[],
): Promise<TherapistPayPreview[]> {
  const paidMatches = matches.filter(
    (match) => match.bill.section === "PAID" && match.matchedInvoiceId,
  );
  if (!paidMatches.length) return [];

  const invoiceIds = paidMatches.map((match) => match.matchedInvoiceId!);
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    include: {
      therapist: { select: { id: true, firstName: true, lastName: true } },
      client: { select: { lniClaimNumber: true } },
      lineItems: { select: { procedureCode: true, serviceDate: true, units: true } },
    },
  });
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const therapistIds = [...new Set(invoices.map((invoice) => invoice.therapistId))];
  const feeRowsByTherapist = new Map<
    string,
    Array<{
      procedureCode: string;
      amount: unknown;
      effectiveFrom: Date | string;
      effectiveTo: Date | string | null;
    }>
  >();

  for (const therapistId of therapistIds) {
    feeRowsByTherapist.set(
      therapistId,
      await prisma.therapistProcedureCodeFee.findMany({
        where: { therapistId },
      }),
    );
  }

  const payouts = new Map<string, TherapistPayPreview>();

  for (const match of paidMatches) {
    const invoice = invoiceById.get(match.matchedInvoiceId!);
    if (!invoice) continue;

    const therapistAmount = await computeTherapistAmountForInvoice(
      invoice,
      feeRowsByTherapist.get(invoice.therapistId) ?? [],
    );

    const payout = payouts.get(invoice.therapistId);
    const line = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      claimNumber: invoice.client.lniClaimNumber,
      lniPaidAmount: match.bill.billTotalPayable,
      therapistAmount,
    };

    if (payout) {
      const existingLine = payout.lines.find((entry) => entry.invoiceId === invoice.id);
      if (existingLine) {
        existingLine.lniPaidAmount =
          Math.round((existingLine.lniPaidAmount + line.lniPaidAmount) * 100) / 100;
        payout.lniPaidAmount = Math.round((payout.lniPaidAmount + line.lniPaidAmount) * 100) / 100;
        continue;
      }

      payout.invoiceCount += 1;
      payout.lniPaidAmount = Math.round((payout.lniPaidAmount + line.lniPaidAmount) * 100) / 100;
      payout.therapistAmount =
        Math.round((payout.therapistAmount + line.therapistAmount) * 100) / 100;
      payout.lines.push(line);
      continue;
    }

    payouts.set(invoice.therapistId, {
      therapistId: invoice.therapistId,
      therapistName: `${invoice.therapist.firstName} ${invoice.therapist.lastName}`,
      invoiceCount: 1,
      lniPaidAmount: line.lniPaidAmount,
      therapistAmount: line.therapistAmount,
      lines: [line],
    });
  }

  return [...payouts.values()].sort((a, b) => a.therapistName.localeCompare(b.therapistName));
}

export async function importRemittanceFromUpload(options: {
  buffer: Buffer;
  sourceFilename: string;
  importedById: string;
}): Promise<{ remittanceAdviceId: string }> {
  const parsed = await parseLniRemittancePdf(options.buffer);
  const matches = await matchRemittanceBills(parsed.bills);
  return importRemittancePreview({
    parsed,
    matches,
    sourceFilename: options.sourceFilename,
    importedById: options.importedById,
  });
}

export async function importRemittancePreview(options: {
  parsed: ParsedRemittanceAdvice;
  matches: MatchedRemittanceBill[];
  sourceFilename?: string;
  importedById: string;
}): Promise<{ remittanceAdviceId: string }> {
  const existing = await prisma.remittanceAdvice.findUnique({
    where: {
      remittanceNumber_warrantRegister: {
        remittanceNumber: options.parsed.remittanceNumber,
        warrantRegister: options.parsed.warrantRegister,
      },
    },
  });
  if (existing) {
    throw new Error(
      `Remittance ${options.parsed.remittanceNumber} (warrant ${options.parsed.warrantRegister}) was already imported.`,
    );
  }

  const remittance = await prisma.remittanceAdvice.create({
    data: {
      remittanceNumber: options.parsed.remittanceNumber,
      warrantRegister: options.parsed.warrantRegister,
      invoiceDate: parseRaDate(options.parsed.invoiceDate),
      reportDate: options.parsed.reportDate ? parseRaDate(options.parsed.reportDate) : null,
      payeeNumber: options.parsed.payeeNumber,
      payeeName: options.parsed.payeeName,
      totalPaid: options.parsed.totalPaid,
      eobCodeDescriptions: options.parsed.eobCodeDescriptions,
      sourceFilename: options.sourceFilename ?? null,
      importedById: options.importedById,
      status: "PREVIEW",
      lines: {
        create: options.matches.map((match) => {
          const eobCodeDescriptions = resolveEobDescriptions(
            match.bill.eobCodes,
            options.parsed.eobCodeDescriptions,
          );
          return {
            section: match.bill.section,
            claimNumber: match.bill.claimNumber,
            icn: match.bill.icn,
            patientName: match.bill.patientName,
            serviceProviderId: match.bill.serviceProviderId,
            serviceProviderNpi: match.bill.serviceProviderNpi,
            serviceProviderName: match.bill.serviceProviderName,
            billTotalPayable: match.bill.billTotalPayable,
            eobCodes: match.bill.eobCodes,
            eobCodeDescriptions,
            serviceLines: match.bill.serviceLines as Prisma.InputJsonValue,
            matchedInvoiceId: match.matchedInvoiceId,
            matchNote: match.matchNote,
          };
        }),
      },
    },
  });

  for (const match of options.matches) {
    await syncInvoiceEobFromLine({
      matchedInvoiceId: match.matchedInvoiceId,
      eobCodes: match.bill.eobCodes,
      eobCodeDescriptions: resolveEobDescriptions(
        match.bill.eobCodes,
        options.parsed.eobCodeDescriptions,
      ),
    });
  }

  return { remittanceAdviceId: remittance.id };
}

async function syncInvoiceEobFromLine(options: {
  matchedInvoiceId: string | null;
  eobCodes: string[];
  eobCodeDescriptions: Record<string, string>;
}): Promise<void> {
  if (!options.matchedInvoiceId) return;

  await prisma.invoice.update({
    where: { id: options.matchedInvoiceId },
    data: {
      lniEobCodes: options.eobCodes,
      lniEobCodeDescriptions: options.eobCodeDescriptions,
    },
  });
}

export async function deleteRemittancePreview(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    select: { id: true, status: true, remittanceNumber: true, warrantRegister: true },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "PREVIEW") {
    throw new Error("Only preview remittances can be deleted.");
  }

  await prisma.remittanceAdvice.delete({ where: { id: remittanceAdviceId } });
}

/** Undo an applied remittance: reset matched invoices and delete RA + pay run. */
export async function revertAppliedRemittance(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: { lines: { select: { matchedInvoiceId: true } } },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "APPLIED") {
    throw new Error("Only applied remittances can be reverted.");
  }

  await prisma.$transaction(async (tx) => {
    for (const line of remittance.lines) {
      if (!line.matchedInvoiceId) continue;
      await tx.invoice.update({
        where: { id: line.matchedInvoiceId },
        data: {
          paymentStatus: "UNPAID",
          lniPaidAt: null,
          lniEobCodes: [],
          lniEobCodeDescriptions: {},
        },
      });
    }

    await tx.remittanceAdvice.delete({ where: { id: remittanceAdviceId } });
  });
}

function parseLineEobDescriptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function lineToRemittanceBill(line: {
  section: RemittanceBill["section"];
  claimNumber: string;
  patientName: string | null;
  icn: string;
  serviceProviderId: string;
  serviceProviderNpi: string | null;
  serviceProviderName: string | null;
  billTotalPayable: unknown;
  eobCodes: string[];
  serviceLines: unknown;
}): RemittanceBill {
  return {
    section: line.section,
    claimNumber: line.claimNumber,
    patientName: line.patientName ?? "",
    icn: line.icn,
    serviceProviderId: line.serviceProviderId,
    serviceProviderNpi: line.serviceProviderNpi ?? "",
    serviceProviderName: line.serviceProviderName ?? "",
    serviceLines: line.serviceLines as RemittanceServiceLine[],
    billTotalBilled: 0,
    billTotalAllowed: 0,
    billTotalNonCovered: 0,
    billTotalPayable: Number(line.billTotalPayable),
    eobCodes: line.eobCodes,
  };
}

export async function rematchRemittanceAdvice(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: { lines: { orderBy: { claimNumber: "asc" } } },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "PREVIEW") {
    throw new Error("Only preview remittances can be re-matched.");
  }

  const bills = remittance.lines.map(lineToRemittanceBill);
  const matches = await matchRemittanceBills(bills);

  for (let index = 0; index < remittance.lines.length; index++) {
    const line = remittance.lines[index]!;
    if (line.supersededAt) continue;

    const match = matches[index];
    await prisma.remittanceAdviceLine.update({
      where: { id: line.id },
      data: {
        matchedInvoiceId: match?.matchedInvoiceId ?? null,
        matchNote: match?.matchNote ?? null,
      },
    });

    if (match?.matchedInvoiceId) {
      const eobCodeDescriptions = parseLineEobDescriptions(line.eobCodeDescriptions);
      await syncInvoiceEobFromLine({
        matchedInvoiceId: match.matchedInvoiceId,
        eobCodes: line.eobCodes,
        eobCodeDescriptions,
      });
    }
  }
}

export async function applyRemittanceAdvice(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      lines: {
        include: {
          matchedInvoice: {
            include: {
              therapist: { select: { id: true, firstName: true, lastName: true } },
              client: { select: { lniClaimNumber: true } },
              lineItems: { select: { procedureCode: true, serviceDate: true, units: true } },
            },
          },
        },
      },
      payRun: true,
    },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status === "APPLIED") throw new Error("This remittance has already been applied.");

  const unmatchedCount = countUnresolvedRemittanceLines(remittance.lines);
  if (unmatchedCount > 0) {
    throw new Error(
      `Cannot apply remittance: ${unmatchedCount} bill(s) could not be matched to an invoice. Fix matching or supersede stale lines before applying.`,
    );
  }

  const activeLines = remittance.lines.filter((line) => !line.supersededAt);

  const therapistPayPreview = await buildTherapistPayPreview(
    activeLines.map((line) => ({
      bill: {
        section: line.section,
        claimNumber: line.claimNumber,
        icn: line.icn,
        patientName: line.patientName ?? "",
        serviceProviderId: line.serviceProviderId,
        serviceProviderNpi: line.serviceProviderNpi ?? "",
        serviceProviderName: line.serviceProviderName ?? "",
        serviceLines: line.serviceLines as never,
        billTotalBilled: 0,
        billTotalAllowed: 0,
        billTotalNonCovered: 0,
        billTotalPayable: Number(line.billTotalPayable),
        eobCodes: line.eobCodes,
      },
      matchedInvoiceId: line.matchedInvoiceId,
      matchNote: line.matchNote,
      paymentStatus: remittanceSectionToPaymentStatus(line.section),
    })),
  );

  await prisma.$transaction(async (tx) => {
    for (const line of activeLines) {
      if (!line.matchedInvoiceId) continue;

      const { paymentStatus, lniPaidAt } = paymentUpdateFromRemittance(
        line.section,
        remittance.invoiceDate,
      );

      await tx.invoice.update({
        where: { id: line.matchedInvoiceId },
        data: {
          paymentStatus,
          lniPaidAt,
          lniEobCodes: line.eobCodes,
          lniEobCodeDescriptions: parseLineEobDescriptions(line.eobCodeDescriptions),
        },
      });
    }

    const payRun = await tx.therapistPayRun.create({
      data: {
        remittanceAdviceId: remittance.id,
        status: "DRAFT",
        payouts: {
          create: therapistPayPreview.map((payout) => ({
            therapistId: payout.therapistId,
            therapistAmount: payout.therapistAmount,
            lniPaidAmount: payout.lniPaidAmount,
            invoiceCount: payout.invoiceCount,
            lines: {
              create: payout.lines.map((line) => ({
                invoiceId: line.invoiceId,
                lniPaidAmount: line.lniPaidAmount,
                therapistAmount: line.therapistAmount,
              })),
            },
          })),
        },
      },
    });

    await tx.remittanceAdvice.update({
      where: { id: remittance.id },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
      },
    });

    void payRun;
  });
}