import type { PaymentStatus, Prisma } from "@/generated/prisma/client";
import { matchRemittanceBills } from "@/lib/match-remittance-to-invoices";
import type { MatchedRemittanceBill } from "@/lib/match-remittance-to-invoices";
import { parseLniRemittancePdf } from "@/lib/parse-lni-remittance-pdf";
import type { ParsedRemittanceAdvice } from "@/lib/parse-lni-remittance-pdf";
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

    const existing = payouts.get(invoice.therapistId);
    const line = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      claimNumber: invoice.client.lniClaimNumber,
      lniPaidAmount: match.bill.billTotalPayable,
      therapistAmount,
    };

    if (existing) {
      existing.invoiceCount += 1;
      existing.lniPaidAmount = Math.round((existing.lniPaidAmount + line.lniPaidAmount) * 100) / 100;
      existing.therapistAmount =
        Math.round((existing.therapistAmount + line.therapistAmount) * 100) / 100;
      existing.lines.push(line);
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
        create: options.matches.map((match) => ({
          section: match.bill.section,
          claimNumber: match.bill.claimNumber,
          icn: match.bill.icn,
          patientName: match.bill.patientName,
          serviceProviderId: match.bill.serviceProviderId,
          serviceProviderNpi: match.bill.serviceProviderNpi,
          serviceProviderName: match.bill.serviceProviderName,
          billTotalPayable: match.bill.billTotalPayable,
          eobCodes: match.bill.eobCodes,
          serviceLines: match.bill.serviceLines as Prisma.InputJsonValue,
          matchedInvoiceId: match.matchedInvoiceId,
          matchNote: match.matchNote,
        })),
      },
    },
  });

  return { remittanceAdviceId: remittance.id };
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

  const unmatchedCount = remittance.lines.filter((line) => !line.matchedInvoiceId).length;
  if (unmatchedCount > 0) {
    throw new Error(
      `Cannot apply remittance: ${unmatchedCount} bill(s) could not be matched to an invoice. Fix matching before applying.`,
    );
  }

  const therapistPayPreview = await buildTherapistPayPreview(
    remittance.lines.map((line) => ({
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
      paymentStatus: line.section === "PAID" ? "PAID" : line.section === "DENIED" ? "DENIED" : "UNPAID",
    })),
  );

  await prisma.$transaction(async (tx) => {
    for (const line of remittance.lines) {
      if (!line.matchedInvoiceId) continue;

      const paymentStatus: PaymentStatus =
        line.section === "PAID" ? "PAID" : line.section === "DENIED" ? "DENIED" : "UNPAID";

      await tx.invoice.update({
        where: { id: line.matchedInvoiceId },
        data: {
          paymentStatus,
          lniPaidAt: paymentStatus === "PAID" ? remittance.invoiceDate : null,
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