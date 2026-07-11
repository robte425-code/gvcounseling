/**
 * Find matched remittance bills where therapist fee schedule is missing.
 * Usage: DOTENV_CONFIG_PATH=.env.production.local npx tsx -r dotenv/config scripts/check-remittance-fee-gaps.ts <pdf>...
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import fs from "fs";
import path from "path";
import { parseLniRemittancePdf } from "../src/lib/parse-lni-remittance-pdf";
import { matchRemittanceBills } from "../src/lib/match-remittance-to-invoices";
import { computeTherapistAmountForInvoice } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

async function main() {
  const pdfs = process.argv.slice(2);
  if (!pdfs.length) {
    console.error("Usage: npx tsx scripts/check-remittance-fee-gaps.ts <pdf>...");
    process.exit(1);
  }

  for (const pdf of pdfs) {
    const parsed = await parseLniRemittancePdf(fs.readFileSync(pdf));
    const matches = await matchRemittanceBills(parsed.bills);
    const paidMatches = matches.filter((m) => m.bill.section === "PAID" && m.matchedInvoiceId);

    console.log(`\n${path.basename(pdf)}: ${paidMatches.length} paid matches`);

    for (const match of paidMatches) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: match.matchedInvoiceId! },
        include: {
          lineItems: { select: { procedureCode: true, serviceDate: true, units: true } },
        },
      });
      if (!invoice) continue;

      const fees = await prisma.therapistProcedureCodeFee.findMany({
        where: { therapistId: invoice.therapistId },
      });

      try {
        await computeTherapistAmountForInvoice(invoice, fees);
      } catch (e) {
        console.log(
          `  MISSING FEE: invoice #${invoice.invoiceNumber} claim ${match.bill.claimNumber}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
