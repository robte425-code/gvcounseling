/**
 * Seed L&I pay periods for 2025 (cutoff + expected payment dates).
 * Usage: npx tsx scripts/seed-pay-periods-2025.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const PERIODS = [
  { cutoff: "01-03-25", payment: "01-07-25" },
  { cutoff: "01-17-25", payment: "01-22-25" },
  { cutoff: "01-31-25", payment: "02-04-25" },
  { cutoff: "02-14-25", payment: "02-19-25" },
  { cutoff: "02-28-25", payment: "03-04-25" },
  { cutoff: "03-14-25", payment: "03-18-25" },
  { cutoff: "03-28-25", payment: "04-01-25" },
  { cutoff: "04-11-25", payment: "04-15-25" },
  { cutoff: "04-25-25", payment: "04-29-25" },
  { cutoff: "05-09-25", payment: "05-13-25" },
  { cutoff: "05-23-25", payment: "05-28-25" },
  { cutoff: "06-06-25", payment: "06-10-25" },
  { cutoff: "06-20-25", payment: "06-24-25" },
  { cutoff: "07-03-25", payment: "07-08-25" },
  { cutoff: "07-18-25", payment: "07-22-25" },
  { cutoff: "08-01-25", payment: "08-05-25" },
  { cutoff: "08-15-25", payment: "08-19-25" },
  { cutoff: "08-29-25", payment: "09-03-25" },
  { cutoff: "09-12-25", payment: "09-16-25" },
  { cutoff: "09-26-25", payment: "09-30-25" },
  { cutoff: "10-10-25", payment: "10-14-25" },
  { cutoff: "10-24-25", payment: "10-28-25" },
  { cutoff: "11-07-25", payment: "11-12-25" },
  { cutoff: "11-21-25", payment: "11-25-25" },
] as const;

function formatLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function findPayPeriodByCutoff(cutoffDate: Date) {
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
  const { parseLniDate } = await import("../src/lib/lni-pay-periods");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of PERIODS) {
    const cutoffDate = parseLniDate(row.cutoff);
    const paymentDate = parseLniDate(row.payment);
    if (!cutoffDate || !paymentDate) {
      throw new Error(`Invalid date pair: ${row.cutoff} / ${row.payment}`);
    }

    const label = formatLabel(cutoffDate);
    const existing = await findPayPeriodByCutoff(cutoffDate);

    if (existing) {
      const unchanged =
        existing.paymentDate?.getTime() === paymentDate.getTime() &&
        (existing.label ?? "") === label;
      if (unchanged) {
        skipped++;
        console.log(`Skip ${row.cutoff} (already exists)`);
        continue;
      }
      await prisma.payPeriod.update({
        where: { id: existing.id },
        data: { paymentDate, label: existing.label ?? label },
      });
      updated++;
      console.log(`Updated ${row.cutoff} → payment ${row.payment}`);
    } else {
      await prisma.payPeriod.create({
        data: { cutoffDate, paymentDate, label },
      });
      created++;
      console.log(`Created ${row.cutoff} → payment ${row.payment}`);
    }
  }

  const total = await prisma.payPeriod.count();
  console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped (${total} pay periods total).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
