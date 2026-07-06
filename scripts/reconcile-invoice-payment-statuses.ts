/**
 * Recompute invoice paymentStatus from applied remittance lines.
 * Uses latest remittance date; PAID > IN_PROCESS > DENIED on that date.
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/reconcile-invoice-payment-statuses.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { reconcileAllInvoicePaymentStatuses } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

async function main() {
  const fix = process.argv.includes("--fix");

  if (!fix) {
    console.log("DRY RUN — pass --fix to reconcile all invoices with applied remittance matches.\n");
    const count = await prisma.remittanceAdviceLine.count({
      where: {
        matchedInvoiceId: { not: null },
        supersededAt: null,
        remittanceAdvice: { status: "APPLIED" },
      },
    });
    console.log(`Matched remittance lines (applied): ${count}`);
    await prisma.$disconnect();
    return;
  }

  const result = await reconcileAllInvoicePaymentStatuses();
  console.log(`Reconciled ${result.updated} invoice(s) from applied remittance matches`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
