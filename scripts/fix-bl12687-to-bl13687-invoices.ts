/**
 * Rebill Maria Alonso Rivera invoices that were submitted to L&I under wrong claim BL12687.
 * Client is correctly BL13687 in the portal; create new UNPAID rebill invoices for resubmission.
 *
 * Source invoices: #883 (2026-02-05, 96156) and #914 (2026-03-06, 96158+96159).
 * #914 is skipped when already PAID via BL13687 RA match (#37039).
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/fix-bl12687-to-bl13687-invoices.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { calendarIsoFromDate } from "../src/lib/constants";
import { getNextInvoiceNumber } from "../src/lib/invoice-numbers";
import { rematchRemittanceAdvice } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

const CORRECT_CLAIM = "BL13687";
const WRONG_CLAIM = "BL12687";

/** Invoices originally submitted to L&I under BL12687 (referral typo). */
const SOURCE_INVOICE_NUMBERS = [883, 914] as const;

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

async function findRebillDuplicate(
  clientId: string,
  excludeInvoiceId: string,
  signature: string,
): Promise<{ id: string; invoiceNumber: number } | null> {
  const candidates = await prisma.invoice.findMany({
    where: {
      clientId,
      id: { not: excludeInvoiceId },
      status: "BILLED",
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

async function isPaidViaCorrectClaim(invoiceId: string): Promise<{
  paid: boolean;
  remittanceNumber?: number;
}> {
  const paidLine = await prisma.remittanceAdviceLine.findFirst({
    where: {
      matchedInvoiceId: invoiceId,
      claimNumber: CORRECT_CLAIM,
      section: "PAID",
    },
    include: { remittanceAdvice: { select: { remittanceNumber: true } } },
  });
  if (!paidLine) return { paid: false };
  return { paid: true, remittanceNumber: paidLine.remittanceAdvice.remittanceNumber };
}

async function main() {
  const fix = process.argv.includes("--fix");

  const maria = await prisma.user.findFirst({
    where: { email: "maria@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!maria) throw new Error("Maria therapist not found.");

  const wrongClaimClient = await prisma.client.findFirst({
    where: { lniClaimNumber: WRONG_CLAIM },
    select: { id: true },
  });
  if (wrongClaimClient) {
    throw new Error(`Unexpected ${WRONG_CLAIM} client still exists: ${wrongClaimClient.id}`);
  }

  const client = await prisma.client.findFirst({
    where: { lniClaimNumber: CORRECT_CLAIM },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      therapistId: true,
    },
  });
  if (!client) throw new Error(`Client ${CORRECT_CLAIM} not found.`);

  const allClientInvoices = await prisma.invoice.findMany({
    where: { clientId: client.id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    orderBy: { invoiceNumber: "asc" },
  });

  console.log(fix ? "FIX MODE" : "DRY RUN");
  console.log(
    `Client: ${client.firstName} ${client.lastName} (${CORRECT_CLAIM}) — ${allClientInvoices.length} invoice(s) in DB\n`,
  );

  const unknownInvoices = allClientInvoices.filter(
    (inv) => !SOURCE_INVOICE_NUMBERS.includes(inv.invoiceNumber as (typeof SOURCE_INVOICE_NUMBERS)[number]),
  );
  if (unknownInvoices.length > 0) {
    console.log("WARNING: unexpected invoices for this client (not in source list):");
    for (const inv of unknownInvoices) {
      const lines = inv.lineItems
        .map((li) => `${li.procedureCode}@${calendarIsoFromDate(li.serviceDate)}`)
        .join(", ");
      console.log(`  #${inv.invoiceNumber} ${lines}`);
    }
    console.log("");
  } else {
    console.log("Investigation: only source invoices #883 and #914 exist for this client.\n");
  }

  const created: { source: number; invoiceNumber: number; serviceDates: string }[] = [];
  const skipped: { source: number; reason: string }[] = [];

  for (const invoiceNumber of SOURCE_INVOICE_NUMBERS) {
    const source = await prisma.invoice.findFirst({
      where: { therapistId: maria.id, invoiceNumber },
      include: {
        client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!source) throw new Error(`Source invoice #${invoiceNumber} not found.`);
    if (source.client.lniClaimNumber !== CORRECT_CLAIM) {
      throw new Error(
        `#${invoiceNumber} client claim mismatch: ${source.client.lniClaimNumber} (expected ${CORRECT_CLAIM})`,
      );
    }

    const lineItems: LineItemInput[] = source.lineItems.map((li) => ({
      procedureCode: li.procedureCode,
      serviceDate: li.serviceDate,
      amount: Number(li.amount),
      units: li.units,
      sortOrder: li.sortOrder,
    }));
    const signature = lineItemSignature(lineItems);
    const serviceDates = [...new Set(lineItems.map((li) => calendarIsoFromDate(li.serviceDate)))].join(", ");
    const codes = lineItems.map((li) => li.procedureCode).join("+");

    console.log(
      `#${invoiceNumber} ${codes} DOS ${serviceDates} $${Number(source.totalAmount)} (billed ${calendarIsoFromDate(source.billedAt!)})`,
    );

    const paidViaCorrectClaim = await isPaidViaCorrectClaim(source.id);
    if (paidViaCorrectClaim.paid) {
      const reason = `already PAID via ${CORRECT_CLAIM} RA ${paidViaCorrectClaim.remittanceNumber}`;
      console.log(`  SKIP: ${reason}`);
      skipped.push({ source: invoiceNumber, reason });
      console.log("");
      continue;
    }

    const duplicate = await findRebillDuplicate(client.id, source.id, signature);
    if (duplicate) {
      const reason = `rebill already exists: #${duplicate.invoiceNumber}`;
      console.log(`  SKIP: ${reason}`);
      skipped.push({ source: invoiceNumber, reason });
      console.log("");
      continue;
    }

    const nextNumber = await getNextInvoiceNumber(prisma, maria.id);
    console.log(`  CREATE rebill #${nextNumber} BILLED/UNPAID (submittedAt=null, payPeriodId=null)`);
    created.push({ source: invoiceNumber, invoiceNumber: nextNumber, serviceDates });

    if (fix) {
      await prisma.invoice.create({
        data: {
          therapistId: maria.id,
          clientId: client.id,
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
            create: lineItems.map((line) => ({
              serviceDate: line.serviceDate,
              procedureCode: line.procedureCode,
              amount: line.amount,
              units: line.units,
              sortOrder: line.sortOrder,
            })),
          },
        },
      });
    }
    console.log("");
  }

  const previewRas = await prisma.remittanceAdvice.findMany({
    where: {
      status: "PREVIEW",
      lines: { some: { claimNumber: { in: [WRONG_CLAIM, CORRECT_CLAIM] } } },
    },
    select: { id: true, remittanceNumber: true },
    orderBy: { remittanceNumber: "asc" },
  });

  console.log(
    `Preview RAs to rematch (${previewRas.length}):`,
    previewRas.map((r) => r.remittanceNumber).join(", "),
  );

  if (fix) {
    for (const ra of previewRas) {
      await rematchRemittanceAdvice(ra.id);
      console.log(`  rematched RA ${ra.remittanceNumber}`);
    }
  }

  if (created.length) {
    console.log("\nRebill invoices to create:");
    for (const c of created) {
      console.log(`  #${c.invoiceNumber} (from #${c.source}) DOS ${c.serviceDates}`);
    }
  }

  if (skipped.length) {
    console.log("\nSkipped:");
    for (const s of skipped) {
      console.log(`  #${s.source}: ${s.reason}`);
    }
  }

  if (fix) {
    console.log("\nRA line matches after fix:");
    const raLines = await prisma.remittanceAdviceLine.findMany({
      where: { claimNumber: { in: [WRONG_CLAIM, CORRECT_CLAIM] } },
      include: {
        remittanceAdvice: { select: { remittanceNumber: true, status: true } },
        matchedInvoice: {
          select: { invoiceNumber: true, paymentStatus: true },
        },
      },
      orderBy: { remittanceAdvice: { remittanceNumber: "asc" } },
    });
    for (const line of raLines) {
      const sl = line.serviceLines as { procedureCode: string; serviceDateFrom: string }[];
      const dos = sl.map((s) => `${s.procedureCode}:${s.serviceDateFrom}`).join(", ");
      console.log(
        `  RA ${line.remittanceAdvice.remittanceNumber} (${line.remittanceAdvice.status}) ${line.section} ${line.claimNumber} ${dos} ->`,
        line.matchedInvoice
          ? `#${line.matchedInvoice.invoiceNumber} (${line.matchedInvoice.paymentStatus})`
          : "UNMATCHED",
        line.matchNote ? `[${line.matchNote}]` : "",
      );
    }
  }

  if (!fix) {
    console.log("\nDry run. Re-run with --fix to apply.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
