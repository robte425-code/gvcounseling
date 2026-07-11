import type { Prisma } from "@/generated/prisma/client";
import { remittanceSectionToPaymentStatus, resolvePaymentFromRemittanceLines, parseInvoiceEobDescriptions, mapRemittanceLinesForResolution } from "@/lib/invoice-payment-status";
import { matchRemittanceBills } from "@/lib/match-remittance-to-invoices";
import type { MatchedRemittanceBill } from "@/lib/match-remittance-to-invoices";
import { countUnresolvedRemittanceLines } from "@/lib/remittance-line-supersede";
import { parseLniRemittancePdf } from "@/lib/parse-lni-remittance-pdf";
import type { ParsedRemittanceAdvice, RemittanceBill, RemittanceServiceLine } from "@/lib/parse-lni-remittance-pdf";
import { resolveEobDescriptions } from "@/lib/parse-lni-remittance-pdf";
import { resolveFeeAmount } from "@/lib/procedure-fee-schedule";
import { prisma } from "@/lib/prisma";

/** Synthetic remittances created by spreadsheet migration scripts (no real L&I RA PDF). */
export function isSyntheticSpreadsheetRemittance(remittanceNumber: string): boolean {
  return remittanceNumber.endsWith("-SPREADSHEET");
}

export const excludeSyntheticSpreadsheetRemittancesWhere = {
  NOT: { remittanceNumber: { endsWith: "-SPREADSHEET" } },
} satisfies Prisma.RemittanceAdviceWhereInput;

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

  const { notifyUnresolvedRemittanceIfNeeded } = await import("@/lib/therapist-pay-notifications");
  await notifyUnresolvedRemittanceIfNeeded(remittance.id);

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

/** Delete a synthetic spreadsheet remittance and its pay run (no L&I RA lines to revert). */
export async function deleteSyntheticSpreadsheetRemittance(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    select: {
      id: true,
      remittanceNumber: true,
      _count: { select: { lines: true } },
    },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (!isSyntheticSpreadsheetRemittance(remittance.remittanceNumber)) {
    throw new Error(
      `Remittance ${remittance.remittanceNumber} is not a synthetic spreadsheet remittance.`,
    );
  }
  if (remittance._count.lines > 0) {
    throw new Error(
      `Synthetic spreadsheet remittance ${remittance.remittanceNumber} has remittance lines; cannot delete safely.`,
    );
  }

  await prisma.remittanceAdvice.delete({ where: { id: remittanceAdviceId } });
}

function parseLineEobDescriptions(value: unknown): Record<string, string> {
  return parseInvoiceEobDescriptions(value);
}

/** Recompute invoice L&I status from all applied, non-superseded remittance matches. */
export async function reconcileInvoicePaymentStatus(
  invoiceId: string,
  tx?: Pick<typeof prisma, "remittanceAdviceLine" | "invoice">,
): Promise<boolean> {
  const db = tx ?? prisma;
  const lines = await db.remittanceAdviceLine.findMany({
    where: {
      matchedInvoiceId: invoiceId,
      supersededAt: null,
      remittanceAdvice: { status: "APPLIED" },
    },
    select: {
      section: true,
      eobCodes: true,
      eobCodeDescriptions: true,
      remittanceAdvice: { select: { invoiceDate: true, eobCodeDescriptions: true } },
    },
  });

  const resolved = resolvePaymentFromRemittanceLines(
    mapRemittanceLinesForResolution(
      lines.map((line) => ({
        section: line.section,
        remittanceDate: line.remittanceAdvice.invoiceDate,
        eobCodes: line.eobCodes,
        eobCodeDescriptions: line.eobCodeDescriptions,
        raEobCodeDescriptions: line.remittanceAdvice.eobCodeDescriptions,
      })),
    ),
  );

  if (!resolved) return false;

  const current = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      paymentStatus: true,
      lniPaidAt: true,
      lniEobCodes: true,
      lniEobCodeDescriptions: true,
    },
  });
  if (!current) return false;

  const sameStatus = current.paymentStatus === resolved.paymentStatus;
  const samePaidAt =
    (current.lniPaidAt?.getTime() ?? null) === (resolved.lniPaidAt?.getTime() ?? null);
  const sameEob =
    JSON.stringify(current.lniEobCodes) === JSON.stringify(resolved.eobCodes) &&
    JSON.stringify(current.lniEobCodeDescriptions) === JSON.stringify(resolved.eobCodeDescriptions);
  if (sameStatus && samePaidAt && sameEob) return false;

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      paymentStatus: resolved.paymentStatus,
      lniPaidAt: resolved.lniPaidAt,
      lniEobCodes: resolved.eobCodes,
      lniEobCodeDescriptions: resolved.eobCodeDescriptions,
    },
  });
  return true;
}

export async function reconcileAllInvoicePaymentStatuses(): Promise<{
  updated: number;
}> {
  const lines = await prisma.remittanceAdviceLine.findMany({
    where: {
      matchedInvoiceId: { not: null },
      supersededAt: null,
      remittanceAdvice: { status: "APPLIED" },
    },
    select: {
      matchedInvoiceId: true,
      section: true,
      eobCodes: true,
      eobCodeDescriptions: true,
      remittanceAdvice: { select: { invoiceDate: true, eobCodeDescriptions: true } },
    },
  });

  const byInvoice = new Map<string, typeof lines>();
  for (const line of lines) {
    const invoiceId = line.matchedInvoiceId!;
    const group = byInvoice.get(invoiceId) ?? [];
    group.push(line);
    byInvoice.set(invoiceId, group);
  }

  const invoiceIds = [...byInvoice.keys()];
  const currents = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: {
      id: true,
      paymentStatus: true,
      lniPaidAt: true,
      lniEobCodes: true,
      lniEobCodeDescriptions: true,
    },
  });
  const currentById = new Map(currents.map((invoice) => [invoice.id, invoice]));

  let updated = 0;
  for (const [invoiceId, invoiceLines] of byInvoice) {
    const resolved = resolvePaymentFromRemittanceLines(
      mapRemittanceLinesForResolution(
        invoiceLines.map((line) => ({
          section: line.section,
          remittanceDate: line.remittanceAdvice.invoiceDate,
          eobCodes: line.eobCodes,
          eobCodeDescriptions: line.eobCodeDescriptions,
          raEobCodeDescriptions: line.remittanceAdvice.eobCodeDescriptions,
        })),
      ),
    );
    if (!resolved) continue;

    const current = currentById.get(invoiceId);
    if (!current) continue;

    const sameStatus = current.paymentStatus === resolved.paymentStatus;
    const samePaidAt =
      (current.lniPaidAt?.getTime() ?? null) === (resolved.lniPaidAt?.getTime() ?? null);
    const sameEob =
      JSON.stringify(current.lniEobCodes) === JSON.stringify(resolved.eobCodes) &&
      JSON.stringify(current.lniEobCodeDescriptions) ===
        JSON.stringify(resolved.eobCodeDescriptions);
    if (sameStatus && samePaidAt && sameEob) continue;

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus: resolved.paymentStatus,
        lniPaidAt: resolved.lniPaidAt,
        lniEobCodes: resolved.eobCodes,
        lniEobCodeDescriptions: resolved.eobCodeDescriptions,
      },
    });
    updated += 1;
  }

  return { updated };
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

  await prisma.$transaction(
    async (tx) => {
      const invoiceIds = [
        ...new Set(
          activeLines
            .map((line) => line.matchedInvoiceId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      await tx.remittanceAdvice.update({
        where: { id: remittance.id },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
        },
      });

      for (const invoiceId of invoiceIds) {
        await reconcileInvoicePaymentStatus(invoiceId, tx);
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

      void payRun;
    },
    { timeout: 120_000 },
  );

  const { notifyRaNeedsAttentionAfterApply } = await import("@/lib/therapist-pay-notifications");
  await notifyRaNeedsAttentionAfterApply(remittance.id);
}