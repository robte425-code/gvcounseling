/**
 * Seed Maria's therapist procedure code fees.
 * Usage: npx tsx scripts/seed-maria-therapist-fees.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { prisma } from "../src/lib/prisma";
import { createTherapistProcedureCodeFee, loadTherapistProcedureCodeFees } from "../src/lib/procedure-fees";

/** Matches import-maria-invoices.ts / parse-maria-invoice-pdf.ts fee schedules. */
const SCHEDULES = [
  {
    effectiveFrom: "2024-03-01",
    fees: {
      "96156": 65,
      "96158": 32.5,
      "96159": 16.25,
      "90837": 90,
      "90834": 67.5,
      "90832": 35,
      "9919M": 30.29,
      "9918M": 24.23,
      "1073M": 27.56,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
  {
    effectiveFrom: "2024-05-10",
    fees: {
      "96156": 70,
      "96158": 35,
      "96159": 17.5,
      "90837": 90,
      "90834": 67.5,
      "90832": 35,
      "9919M": 30.29,
      "9918M": 24.23,
      "1073M": 27.56,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
  {
    effectiveFrom: "2025-03-01",
    fees: {
      "96156": 75,
      "96158": 37.5,
      "96159": 18.75,
      "90837": 95,
      "90834": 71.25,
      "90832": 47.5,
      "9919M": 33.21,
      "9918M": 26.57,
      "1073M": 30.21,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
  {
    effectiveFrom: "2026-03-01",
    fees: {
      "96156": 77,
      "96158": 38.5,
      "96159": 19.25,
      "90837": 97,
      "90834": 72.75,
      "90832": 48.5,
      "9919M": 34.45,
      "9918M": 27.56,
      "1073M": 31.34,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
] as const;

async function main() {
  const maria = await prisma.user.findFirst({
    where: {
      role: "THERAPIST",
      OR: [
        { email: "maria@gvcounseling.com" },
        { firstName: { contains: "Maria", mode: "insensitive" } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!maria) throw new Error("Maria therapist account not found.");

  console.log(`Seeding fees for ${maria.firstName} ${maria.lastName} (${maria.email})`);

  for (const schedule of SCHEDULES) {
    for (const [procedureCode, amount] of Object.entries(schedule.fees)) {
      await createTherapistProcedureCodeFee({
        therapistId: maria.id,
        procedureCode,
        amount,
        effectiveFrom: new Date(`${schedule.effectiveFrom}T00:00:00.000Z`),
      });
      console.log(`  ${procedureCode} $${amount} effective ${schedule.effectiveFrom}`);
    }
  }

  const rows = await loadTherapistProcedureCodeFees(maria.id);
  console.log(`\n${rows.length} fee rows on file:`);
  for (const row of rows) {
    console.log(
      row.procedureCode,
      Number(row.amount).toFixed(2),
      row.effectiveFrom.toISOString().slice(0, 10),
      row.effectiveTo?.toISOString().slice(0, 10) ?? "current",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
