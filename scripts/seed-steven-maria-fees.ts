/**
 * Seed Steven therapist fees (3/1/25) and Maria 1073M (3/1/26).
 * Usage: npx tsx scripts/seed-steven-maria-fees.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { prisma } from "../src/lib/prisma";
import { createTherapistProcedureCodeFee, loadTherapistProcedureCodeFees } from "../src/lib/procedure-fees";

async function seedTherapistFees(
  therapist: { id: string; firstName: string; lastName: string; email: string },
  schedules: { effectiveFrom: string; fees: Record<string, number> }[],
) {
  console.log(`\nSeeding fees for ${therapist.firstName} ${therapist.lastName} (${therapist.email})`);

  for (const schedule of schedules) {
    for (const [procedureCode, amount] of Object.entries(schedule.fees)) {
      await createTherapistProcedureCodeFee({
        therapistId: therapist.id,
        procedureCode,
        amount,
        effectiveFrom: new Date(`${schedule.effectiveFrom}T00:00:00.000Z`),
      });
      console.log(`  ${procedureCode} $${amount} effective ${schedule.effectiveFrom}`);
    }
  }

  const rows = await loadTherapistProcedureCodeFees(therapist.id);
  console.log(`${rows.length} fee rows on file:`);
  for (const row of rows) {
    console.log(
      " ",
      row.procedureCode,
      Number(row.amount).toFixed(2),
      row.effectiveFrom.toISOString().slice(0, 10),
      row.effectiveTo?.toISOString().slice(0, 10) ?? "current",
    );
  }
}

async function main() {
  const [steven, maria] = await Promise.all([
    prisma.user.findFirst({
      where: { role: "THERAPIST", email: "steven@gvcounseling.com" },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.user.findFirst({
      where: { role: "THERAPIST", email: "maria@gvcounseling.com" },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  if (!steven) throw new Error("Steven therapist account not found.");
  if (!maria) throw new Error("Maria therapist account not found.");

  await seedTherapistFees(steven, [
    {
      effectiveFrom: "2025-03-01",
      fees: {
        "96156": 85,
        "96158": 42.5,
        "96159": 21.25,
        "90837": 95,
        "90834": 71.25,
        "90832": 47.5,
        "9919M": 34.45,
        "9918M": 27.56,
        "1073M": 31.34,
      },
    },
  ]);

  await seedTherapistFees(maria, [
    {
      effectiveFrom: "2026-03-01",
      fees: {
        "1073M": 31.34,
      },
    },
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
