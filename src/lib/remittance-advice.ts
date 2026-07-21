import type { Prisma, RemittanceSourceFormat } from "@/generated/prisma/client";
import { remittanceSectionToPaymentStatus, resolvePaymentFromRemittanceLines, parseInvoiceEobDescriptions, mapRemittanceLinesForResolution } from "@/lib/invoice-payment-status";
import { matchRemittanceBills } from "@/lib/match-remittance-to-invoices";
import type { MatchedRemittanceBill } from "@/lib/match-remittance-to-invoices";
import { countUnresolvedRemittanceLines } from "@/lib/remittance-line-supersede";
import { parseLniRemittance835 } from "@/lib/parse-lni-remittance-835";
import { parseLniRemittancePdf } from "@/lib/parse-lni-remittance-pdf";
import type { ParsedRemittanceAdvice, RemittanceBill, RemittanceServiceLine } from "@/lib/parse-lni-remittance-pdf";
import { detectRemittanceSourceFormat } from "@/lib/remittance-file-format";
import { resolveEobDescriptions } from "@/lib/parse-lni-remittance-pdf";
import { computeTherapistPayAmountForInvoice } from "@/lib/invoice-therapist-payment";
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
    lineItems: Array<{
      procedureCode: string;
      serviceDate: Date;
      units: number;
      amount?: unknown;
    }>;
    totalAmount?: unknown;
  },
  feeRows: Array<{
    procedureCode: string;
    amount: unknown;
    effectiveFrom: Date | string;
    effectiveTo: Date | string | null;
  }>,
): Promise<number> {
  return computeTherapistPayAmountForInvoice(invoice, feeRows);
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
      lineItems: {
        select: { procedureCode: true, serviceDate: true, units: true, amount: true },
      },
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
  const sourceFormat = detectRemittanceSourceFormat(options.buffer, options.sourceFilename);
  const parsed =
    sourceFormat === "ERA_835"
      ? parseLniRemittance835(options.buffer, { sourceFilename: options.sourceFilename })
      : await parseLniRemittancePdf(options.buffer);
  const matches = await matchRemittanceBills(parsed.bills);
  return importRemittancePreview({
    parsed,
    matches,
    sourceFilename: options.sourceFilename,
    importedById: options.importedById,
    sourceFormat,
  });
}

export async function importRemittanceFromEra835(options: {
  buffer: Buffer;
  sourceFilename: string;
  importedById: string;
}): Promise<{ remittanceAdviceId: string }> {
  const parsed = parseLniRemittance835(options.buffer, { sourceFilename: options.sourceFilename });
  const matches = await matchRemittanceBills(parsed.bills);
  return importRemittancePreview({
    parsed,
    matches,
    sourceFilename: options.sourceFilename,
    importedById: options.importedById,
    sourceFormat: "ERA_835",
  });
}

export async function importRemittancePreview(options: {
  parsed: ParsedRemittanceAdvice;
  matches: MatchedRemittanceBill[];
  sourceFilename?: string;
  importedById: string;
  sourceFormat?: RemittanceSourceFormat;
}): Promise<{ remittanceAdviceId: string }> {
  const sourceFormat = options.sourceFormat ?? "PDF_RA";
  const existing = await prisma.remittanceAdvice.findUnique({
    where: {
      remittanceNumber_warrantRegister_sourceFormat: {
        remittanceNumber: options.parsed.remittanceNumber,
        warrantRegister: options.parsed.warrantRegister,
        sourceFormat,
      },
    },
  });
  if (existing) {
    const label = sourceFormat === "ERA_835" ? "835 ERA" : "PDF RA";
    throw new Error(
      `Remittance ${options.parsed.remittanceNumber} (warrant ${options.parsed.warrantRegister}) was already imported as ${label}.`,
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
      sourceFormat,
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

type RemittanceDb = Pick<typeof prisma, "remittanceAdviceLine" | "invoice" | "remittanceAdvice">;

/** After a preview/applied line is removed or rematched, fix L&I payment + preview EOB on the invoice. */
export async function reconcileInvoiceAfterRemittanceUnmatch(
  invoiceId: string,
  tx?: RemittanceDb,
): Promise<void> {
  const db = tx ?? prisma;

  const hasAppliedLine = await db.remittanceAdviceLine.findFirst({
    where: {
      matchedInvoiceId: invoiceId,
      supersededAt: null,
      remittanceAdvice: { status: "APPLIED" },
    },
    select: { id: true },
  });

  if (hasAppliedLine) {
    await reconcileInvoicePaymentStatus(invoiceId, tx);
  } else {
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus: "UNPAID",
        lniPaidAt: null,
      },
    });
  }

  const previewLine = await db.remittanceAdviceLine.findFirst({
    where: {
      matchedInvoiceId: invoiceId,
      supersededAt: null,
      remittanceAdvice: { status: "PREVIEW" },
    },
    orderBy: { remittanceAdvice: { invoiceDate: "desc" } },
    select: { eobCodes: true, eobCodeDescriptions: true },
  });

  if (previewLine) {
    await syncInvoiceEobFromLine({
      matchedInvoiceId: invoiceId,
      eobCodes: previewLine.eobCodes,
      eobCodeDescriptions: parseLineEobDescriptions(previewLine.eobCodeDescriptions),
    });
    return;
  }

  if (!hasAppliedLine) {
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        lniEobCodes: [],
        lniEobCodeDescriptions: {},
      },
    });
  }
}

export async function deleteRemittancePreview(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: { lines: { select: { matchedInvoiceId: true } } },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "PREVIEW") {
    throw new Error("Only preview remittances can be deleted.");
  }

  const invoiceIds = [
    ...new Set(
      remittance.lines
        .map((line) => line.matchedInvoiceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  await prisma.$transaction(async (tx) => {
    await tx.remittanceAdvice.delete({ where: { id: remittanceAdviceId } });
    for (const invoiceId of invoiceIds) {
      await reconcileInvoiceAfterRemittanceUnmatch(invoiceId, tx);
    }
  });
}

/** Undo an applied remittance: reset matched invoices and delete RA + pay run. */
export async function revertAppliedRemittance(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      lines: { select: { matchedInvoiceId: true } },
      payRun: { select: { status: true } },
    },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "APPLIED") {
    throw new Error("Only applied remittances can be reverted.");
  }
  if (remittance.payRun?.status === "FINALIZED") {
    throw new Error(
      "Cannot revert a remittance with finalized therapist pay. Unfinalize is not supported.",
    );
  }

  const invoiceIds = [
    ...new Set(
      remittance.lines
        .map((line) => line.matchedInvoiceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  await prisma.$transaction(async (tx) => {
    await tx.remittanceAdvice.delete({ where: { id: remittanceAdviceId } });
    for (const invoiceId of invoiceIds) {
      await reconcileInvoiceAfterRemittanceUnmatch(invoiceId, tx);
    }
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

export async function rematchRemittanceAdvice(
  remittanceAdviceId: string,
  options?: { onlyUnresolved?: boolean },
): Promise<{ updatedLineCount: number }> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: { lines: { orderBy: { claimNumber: "asc" } } },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "PREVIEW") {
    throw new Error("Only preview remittances can be re-matched.");
  }

  const onlyUnresolved = Boolean(options?.onlyUnresolved);
  const reservedInvoiceIds = onlyUnresolved
    ? remittance.lines
        .filter((line) => !line.supersededAt && line.matchedInvoiceId)
        .map((line) => line.matchedInvoiceId!)
    : [];
  const bills = remittance.lines.map(lineToRemittanceBill);
  const matches = await matchRemittanceBills(bills, { reservedInvoiceIds });
  const affectedInvoiceIds = new Set<string>();
  let updatedLineCount = 0;

  for (let index = 0; index < remittance.lines.length; index++) {
    const line = remittance.lines[index]!;
    if (line.supersededAt) continue;
    if (onlyUnresolved && line.matchedInvoiceId) continue;

    if (line.matchedInvoiceId) {
      affectedInvoiceIds.add(line.matchedInvoiceId);
    }

    const match = matches[index];
    const nextMatchedId = match?.matchedInvoiceId ?? null;
    if (nextMatchedId) {
      affectedInvoiceIds.add(nextMatchedId);
    }

    const nextNote = match?.matchNote ?? null;
    if (line.matchedInvoiceId === nextMatchedId && line.matchNote === nextNote) {
      continue;
    }

    await prisma.remittanceAdviceLine.update({
      where: { id: line.id },
      data: {
        matchedInvoiceId: nextMatchedId,
        matchNote: nextNote,
      },
    });
    updatedLineCount += 1;

    if (nextMatchedId) {
      const eobCodeDescriptions = parseLineEobDescriptions(line.eobCodeDescriptions);
      await syncInvoiceEobFromLine({
        matchedInvoiceId: nextMatchedId,
        eobCodes: line.eobCodes,
        eobCodeDescriptions,
      });
    }
  }

  for (const invoiceId of affectedInvoiceIds) {
    await reconcileInvoiceAfterRemittanceUnmatch(invoiceId);
  }

  return { updatedLineCount };
}

/** Auto-rematch only unmatched preview lines (keeps existing matches intact). */
export async function rematchUnresolvedRemittanceLines(
  remittanceAdviceId: string,
): Promise<number> {
  const result = await rematchRemittanceAdvice(remittanceAdviceId, { onlyUnresolved: true });
  return result.updatedLineCount;
}

/** Rematch unresolved lines on every open PREVIEW remittance (e.g. after invoices become Billed). */
export async function rematchUnresolvedOnOpenPreviews(): Promise<number> {
  const previews = await prisma.remittanceAdvice.findMany({
    where: { status: "PREVIEW" },
    select: {
      id: true,
      lines: { select: { matchedInvoiceId: true, supersededAt: true } },
    },
  });

  let updated = 0;
  for (const preview of previews) {
    if (countUnresolvedRemittanceLines(preview.lines) === 0) continue;
    updated += await rematchUnresolvedRemittanceLines(preview.id);
  }
  return updated;
}

export async function unmatchRemittanceLine(
  remittanceAdviceId: string,
  lineId: string,
): Promise<void> {
  const line = await prisma.remittanceAdviceLine.findFirst({
    where: { id: lineId, remittanceAdviceId },
    include: { remittanceAdvice: { select: { status: true } } },
  });

  if (!line) throw new Error("Remittance line not found.");
  if (line.remittanceAdvice.status !== "PREVIEW") {
    throw new Error("Only preview remittance lines can be unmatched.");
  }
  if (line.supersededAt) {
    throw new Error("Superseded lines cannot be unmatched.");
  }
  if (!line.matchedInvoiceId) {
    throw new Error("This line is not matched to an invoice.");
  }

  const previousInvoiceId = line.matchedInvoiceId;
  await prisma.remittanceAdviceLine.update({
    where: { id: lineId },
    data: { matchedInvoiceId: null, matchNote: null },
  });
  await reconcileInvoiceAfterRemittanceUnmatch(previousInvoiceId);
}

export async function manualMatchRemittanceLine(options: {
  remittanceAdviceId: string;
  lineId: string;
  invoiceNumber: number;
}): Promise<void> {
  const line = await prisma.remittanceAdviceLine.findFirst({
    where: { id: options.lineId, remittanceAdviceId: options.remittanceAdviceId },
    include: { remittanceAdvice: { select: { status: true } } },
  });

  if (!line) throw new Error("Remittance line not found.");
  if (line.remittanceAdvice.status !== "PREVIEW") {
    throw new Error("Only preview remittance lines can be manually matched.");
  }
  if (line.supersededAt) {
    throw new Error("Superseded lines cannot be matched.");
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: options.invoiceNumber,
      status: "BILLED",
      client: { lniClaimNumber: line.claimNumber },
    },
    select: { id: true },
  });

  if (!invoice) {
    throw new Error(
      `No billed invoice #${options.invoiceNumber} found for claim ${line.claimNumber}.`,
    );
  }

  const previousInvoiceId = line.matchedInvoiceId;
  const affected = new Set<string>([invoice.id]);
  if (previousInvoiceId) affected.add(previousInvoiceId);

  await prisma.remittanceAdviceLine.update({
    where: { id: line.id },
    data: {
      matchedInvoiceId: invoice.id,
      matchNote: `Manually matched to invoice #${options.invoiceNumber}.`,
    },
  });

  await syncInvoiceEobFromLine({
    matchedInvoiceId: invoice.id,
    eobCodes: line.eobCodes,
    eobCodeDescriptions: parseLineEobDescriptions(line.eobCodeDescriptions),
  });

  for (const invoiceId of affected) {
    await reconcileInvoiceAfterRemittanceUnmatch(invoiceId);
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
              lineItems: {
                select: { procedureCode: true, serviceDate: true, units: true, amount: true },
              },
            },
          },
        },
      },
      payRun: true,
    },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status === "APPLIED") throw new Error("This remittance has already been applied.");

  const siblingApplied = await prisma.remittanceAdvice.findFirst({
    where: {
      remittanceNumber: remittance.remittanceNumber,
      warrantRegister: remittance.warrantRegister,
      status: "APPLIED",
      sourceFormat: { not: remittance.sourceFormat },
    },
    select: { id: true, sourceFormat: true },
  });
  if (siblingApplied) {
    const appliedLabel = siblingApplied.sourceFormat === "ERA_835" ? "835 ERA" : "PDF RA";
    throw new Error(
      `Cannot apply: the ${appliedLabel} for this remittance is already applied. Revert it first if you need to switch sources.`,
    );
  }

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
              computedTherapistAmount: payout.therapistAmount,
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