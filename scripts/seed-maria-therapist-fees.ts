/**
 * Seed Maria's therapist procedure code fees.
 * Usage: npx tsx scripts/seed-maria-therapist-fees.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { prisma } from "../src/lib/prisma";
import { createTherapistProcedureCodeFee, loadTherapistProcedureCodeFees } from "../src/lib/procedure-fees";

const SCHEDULES = [
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
