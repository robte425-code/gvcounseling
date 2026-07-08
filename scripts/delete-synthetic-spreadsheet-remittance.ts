/**
 * Delete a synthetic spreadsheet remittance (MARIA-SPREADSHEET, STEVEN-SPREADSHEET, etc.).
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/delete-synthetic-spreadsheet-remittance.ts [remittanceNumber]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import {
  deleteSyntheticSpreadsheetRemittance,
  isSyntheticSpreadsheetRemittance,
} from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

async function main() {
  const remittanceNumber = process.argv[2] ?? "MARIA-SPREADSHEET";
  if (!isSyntheticSpreadsheetRemittance(remittanceNumber)) {
    throw new Error(`Not a synthetic spreadsheet remittance: ${remittanceNumber}`);
  }

  const remittance = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber },
    select: {
      id: true,
      remittanceNumber: true,
      warrantRegister: true,
      invoiceDate: true,
      status: true,
      _count: { select: { lines: true } },
      payRun: {
        select: {
          id: true,
          payouts: {
            select: {
              therapist: { select: { firstName: true, lastName: true } },
              invoiceCount: true,
              therapistAmount: true,
              _count: { select: { lines: true } },
            },
          },
        },
      },
    },
  });

  if (!remittance) {
    console.log(`No remittance found for ${remittanceNumber}.`);
    await prisma.$disconnect();
    return;
  }

  console.log("Found remittance:", {
    id: remittance.id,
    remittanceNumber: remittance.remittanceNumber,
    warrantRegister: remittance.warrantRegister,
    invoiceDate: remittance.invoiceDate.toISOString().slice(0, 10),
    status: remittance.status,
    lineCount: remittance._count.lines,
    payRun: remittance.payRun
      ? {
          id: remittance.payRun.id,
          payouts: remittance.payRun.payouts.map((payout) => ({
            therapist: `${payout.therapist.firstName} ${payout.therapist.lastName}`,
            invoiceCount: payout.invoiceCount,
            therapistAmount: Number(payout.therapistAmount),
            lineCount: payout._count.lines,
          })),
        }
      : null,
  });

  await deleteSyntheticSpreadsheetRemittance(remittance.id);

  const gone = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber },
    select: { id: true },
  });
  console.log(gone ? "ERROR: remittance still exists" : `Deleted ${remittanceNumber}.`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
