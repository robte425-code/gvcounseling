/**
 * Backfill clmControlNumber on BILLED invoices missing CLM (historical spreadsheet imports).
 * Uses the same random 20-char hex format as 837 generation.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.smoke.local npx tsx scripts/backfill-billed-invoice-clm.ts
 *   DOTENV_CONFIG_PATH=.env.smoke.local npx tsx scripts/backfill-billed-invoice-clm.ts --fix
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { generateClmControlNumber } from "../src/lib/edi837";
import { prisma } from "../src/lib/prisma";

const MISSING_CLM_WHERE = {
  status: "BILLED" as const,
  OR: [{ clmControlNumber: null }, { clmControlNumber: "" }],
};

function allocateUniqueClm(used: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const clm = generateClmControlNumber();
    if (!used.has(clm)) {
      used.add(clm);
      return clm;
    }
  }
  throw new Error("Could not allocate unique CLM control number after 100 attempts.");
}

async function loadUsedClmControlNumbers(): Promise<Set<string>> {
  const rows = await prisma.invoice.findMany({
    where: { clmControlNumber: { not: null } },
    select: { clmControlNumber: true },
  });
  return new Set(
    rows
      .map((row) => row.clmControlNumber)
      .filter((clm): clm is string => Boolean(clm && clm.length > 0)),
  );
}

async function main() {
  const fix = process.argv.includes("--fix");

  const missing = await prisma.invoice.findMany({
    where: MISSING_CLM_WHERE,
    select: {
      id: true,
      invoiceNumber: true,
      billedAt: true,
      submittedAt: true,
      createdAt: true,
      therapist: { select: { lastName: true } },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const usedClms = await loadUsedClmControlNumbers();
  const missingBilledAt = missing.filter((inv) => !inv.billedAt).length;

  console.log(
    `BILLED invoices missing CLM: ${missing.length}` +
      (missingBilledAt ? ` (${missingBilledAt} also missing billedAt)` : ""),
  );

  if (missing.length > 0) {
    console.log("\nSample (first 10):");
    for (const inv of missing.slice(0, 10)) {
      console.log(
        `  #${inv.invoiceNumber} (${inv.therapist.lastName}) billedAt=${inv.billedAt?.toISOString().slice(0, 10) ?? "null"}`,
      );
    }
    if (missing.length > 10) {
      console.log(`  ... and ${missing.length - 10} more`);
    }
  }

  if (!fix) {
    console.log("\nDRY RUN — pass --fix to assign CLM control numbers.");
    await prisma.$disconnect();
    return;
  }

  if (missing.length === 0) {
    console.log("\nNothing to backfill.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  const batchSize = 50;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    await prisma.$transaction(
      batch.map((inv) => {
        const clmControlNumber = allocateUniqueClm(usedClms);
        const billedAt = inv.billedAt ?? inv.submittedAt ?? inv.createdAt;
        return prisma.invoice.update({
          where: { id: inv.id },
          data: {
            clmControlNumber,
            ...(inv.billedAt ? {} : { billedAt }),
          },
        });
      }),
    );
    updated += batch.length;
    console.log(`Updated ${updated}/${missing.length}...`);
  }

  const remaining = await prisma.invoice.count({ where: MISSING_CLM_WHERE });
  console.log(`\nDone. Assigned CLM to ${updated} invoice(s). Remaining missing: ${remaining}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
