/**
 * Sync L&I pay periods from the public payment schedule page.
 * Usage: npx tsx scripts/sync-pay-periods-from-lni.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function findPayPeriodByCutoff(
  prisma: Awaited<ReturnType<typeof import("../src/lib/prisma").createPrismaClient>>,
  cutoffDate: Date,
) {
  const dayStart = Date.UTC(
    cutoffDate.getUTCFullYear(),
    cutoffDate.getUTCMonth(),
    cutoffDate.getUTCDate(),
  );
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return prisma.payPeriod.findFirst({
    where: {
      cutoffDate: { gte: new Date(dayStart), lt: new Date(dayEnd) },
    },
  });
}

async function main() {
  const { fetchLniPayPeriods } = await import("../src/lib/lni-pay-periods");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const rows = await fetchLniPayPeriods();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await findPayPeriodByCutoff(prisma, row.cutoffDate);
    if (existing) {
      const unchanged =
        existing.paymentDate?.getTime() === row.paymentDate.getTime() &&
        (existing.label ?? "") === row.label;
      if (unchanged) {
        skipped++;
        continue;
      }
      await prisma.payPeriod.update({
        where: { id: existing.id },
        data: {
          paymentDate: row.paymentDate,
          label: existing.label ?? row.label,
        },
      });
      updated++;
    } else {
      await prisma.payPeriod.create({
        data: {
          cutoffDate: row.cutoffDate,
          paymentDate: row.paymentDate,
          label: row.label,
        },
      });
      created++;
    }
  }

  const total = await prisma.payPeriod.count();
  console.log(
    `Done: ${created} created, ${updated} updated, ${skipped} skipped (${total} pay periods total).`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
