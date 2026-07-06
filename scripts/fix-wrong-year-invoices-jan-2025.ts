/**
 * Fix Maria invoices #849, #851, #853 where spreadsheet used 2026 DOS but PDFs/L&I show Jan 2025.
 *
 * - Revert those invoices to 2026 service dates (match Drive folders; folders were not renamed)
 * - Mark them UNPAID (L&I never paid the misdated submissions)
 * - Create new BILLED/UNPAID invoices with correct 2025 DOS for L&I resubmission
 * - Rematch affected preview RAs
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/fix-wrong-year-invoices-jan-2025.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { calendarIsoFromDate } from "../src/lib/constants";
import { getNextInvoiceNumber } from "../src/lib/invoice-numbers";
import { rematchRemittanceAdvice } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

const WRONG_YEAR_INVOICES = [
  { invoiceNumber: 851, claim: "ZB71415", wrongDate: "2026-01-08", correctDate: "2025-01-08" },
  { invoiceNumber: 853, claim: "BM32698", wrongDate: "2026-01-09", correctDate: "2025-01-09" },
  { invoiceNumber: 849, claim: "BN79103", wrongDate: "2026-01-08", correctDate: "2025-01-08" },
] as const;

const LINE_ITEMS = [
  { procedureCode: "96158", amount: 37.5, units: 1 },
  { procedureCode: "96159", amount: 18.75, units: 1 },
  { procedureCode: "96159", amount: 18.75, units: 1 },
] as const;

const TOTAL_AMOUNT = 75;

async function main() {
  const fix = process.argv.includes("--fix");

  const maria = await prisma.user.findFirst({
    where: { email: "maria@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!maria) throw new Error("Maria therapist not found.");

  console.log(fix ? "FIX MODE" : "DRY RUN");
  console.log("Drive session folders: not renamed by this tool (still 01-08-2026 / 01-09-2026).\n");

  const created: { claim: string; serviceDate: string; invoiceNumber: number }[] = [];

  for (const row of WRONG_YEAR_INVOICES) {
    const wrongInvoice = await prisma.invoice.findFirst({
      where: { therapistId: maria.id, invoiceNumber: row.invoiceNumber },
      include: {
        client: { select: { id: true, lniClaimNumber: true, firstName: true, lastName: true } },
        lineItems: true,
      },
    });
    if (!wrongInvoice) throw new Error(`Invoice #${row.invoiceNumber} not found.`);
    if (wrongInvoice.client.lniClaimNumber !== row.claim) {
      throw new Error(`#${row.invoiceNumber} claim mismatch: ${wrongInvoice.client.lniClaimNumber}`);
    }

    const currentDates = wrongInvoice.lineItems.map((li) => calendarIsoFromDate(li.serviceDate));
    console.log(
      `#${row.invoiceNumber} ${row.claim} (${wrongInvoice.client.firstName} ${wrongInvoice.client.lastName})`,
    );
    console.log(`  current dates: ${currentDates.join(", ")}`);
    console.log(`  revert to: ${row.wrongDate} | payment -> UNPAID`);

    const duplicate = await prisma.invoice.findFirst({
      where: {
        clientId: wrongInvoice.client.id,
        id: { not: wrongInvoice.id },
        status: "BILLED",
        lineItems: { some: { serviceDate: new Date(`${row.correctDate}T00:00:00.000Z`) } },
      },
      select: { invoiceNumber: true },
    });
    if (duplicate) {
      console.log(`  resubmit invoice already exists: #${duplicate.invoiceNumber}`);
    } else {
      const nextNumber = await getNextInvoiceNumber(prisma, maria.id);
      console.log(`  create resubmit invoice #${nextNumber} DOS ${row.correctDate} UNPAID`);
      created.push({ claim: row.claim, serviceDate: row.correctDate, invoiceNumber: nextNumber });

      if (fix) {
        await prisma.invoice.create({
          data: {
            therapistId: maria.id,
            clientId: wrongInvoice.client.id,
            invoiceNumber: nextNumber,
            status: "BILLED",
            paymentStatus: "UNPAID",
            lniPaidAt: null,
            lniEobCodes: [],
            lniEobCodeDescriptions: {},
            totalAmount: TOTAL_AMOUNT,
            billedAt: new Date(`${row.wrongDate}T00:00:00.000Z`),
            submittedAt: null,
            lineItems: {
              create: LINE_ITEMS.map((line, sortOrder) => ({
                serviceDate: new Date(`${row.correctDate}T00:00:00.000Z`),
                procedureCode: line.procedureCode,
                amount: line.amount,
                units: line.units,
                sortOrder,
              })),
            },
          },
        });
      }
    }

    if (fix) {
      await prisma.invoiceLineItem.updateMany({
        where: { invoiceId: wrongInvoice.id },
        data: { serviceDate: new Date(`${row.wrongDate}T00:00:00.000Z`) },
      });
      await prisma.invoice.update({
        where: { id: wrongInvoice.id },
        data: {
          paymentStatus: "UNPAID",
          lniPaidAt: null,
          lniEobCodes: [],
          lniEobCodeDescriptions: {},
        },
      });
    }
    console.log("");
  }

  const raNumbers = await prisma.remittanceAdvice.findMany({
    where: {
      status: "PREVIEW",
      lines: { some: { claimNumber: { in: WRONG_YEAR_INVOICES.map((r) => r.claim) } } },
    },
    select: { id: true, remittanceNumber: true },
    orderBy: { remittanceNumber: "asc" },
  });

  console.log(`Preview RAs to rematch (${raNumbers.length}):`, raNumbers.map((r) => r.remittanceNumber).join(", "));

  if (fix) {
    for (const ra of raNumbers) {
      await rematchRemittanceAdvice(ra.id);
      console.log(`  rematched RA ${ra.remittanceNumber}`);
    }
  }

  if (fix && created.length) {
    console.log("\nCreated resubmit invoices:");
    for (const c of created) {
      console.log(`  #${c.invoiceNumber} ${c.claim} ${c.serviceDate}`);
    }

    console.log("\n2025 RA line matches after fix:");
    for (const row of WRONG_YEAR_INVOICES) {
      const lines = await prisma.remittanceAdviceLine.findMany({
        where: {
          claimNumber: row.claim,
          serviceLines: { string_contains: row.correctDate },
        },
        include: {
          remittanceAdvice: { select: { remittanceNumber: true } },
          matchedInvoice: { select: { invoiceNumber: true } },
        },
      });
      for (const line of lines) {
        const dos = (line.serviceLines as { procedureCode: string; serviceDateFrom: string }[])
          .map((s) => `${s.procedureCode}:${s.serviceDateFrom}`)
          .join(", ");
        console.log(
          `  RA ${line.remittanceAdvice.remittanceNumber} ${line.section} ${dos} ->`,
          line.matchedInvoice ? `#${line.matchedInvoice.invoiceNumber}` : "UNMATCHED",
        );
      }
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
