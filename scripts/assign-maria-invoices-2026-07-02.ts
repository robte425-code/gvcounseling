import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const INVOICE_NUMBERS = [1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014];
const CUTOFF_ISO = "2026-07-02";

async function main() {
  const fix = process.argv.includes("--fix");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const maria = await prisma.user.findUnique({
    where: { email: "maria@gvcounseling.com" },
    select: { id: true },
  });
  if (!maria) throw new Error("Maria therapist not found");

  const cutoffDate = new Date(`${CUTOFF_ISO}T00:00:00.000Z`);
  const dayStart = Date.UTC(
    cutoffDate.getUTCFullYear(),
    cutoffDate.getUTCMonth(),
    cutoffDate.getUTCDate(),
  );

  let payPeriod = await prisma.payPeriod.findFirst({
    where: { cutoffDate: { gte: new Date(dayStart), lt: new Date(dayStart + 86400000) } },
    select: { id: true, label: true, cutoffDate: true },
  });

  if (!payPeriod) {
    const nearby = await prisma.payPeriod.findMany({
      where: {
        cutoffDate: {
          gte: new Date("2026-06-01T00:00:00.000Z"),
          lte: new Date("2026-08-01T00:00:00.000Z"),
        },
      },
      orderBy: { cutoffDate: "asc" },
      select: { id: true, label: true, cutoffDate: true },
    });
    console.log("No pay period for 2026-07-02. Nearby:");
    for (const p of nearby) {
      console.log(`  ${p.cutoffDate.toISOString().slice(0, 10)} ${p.label ?? ""} ${p.id}`);
    }
    await prisma.$disconnect();
    process.exit(1);
  }

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: maria.id, invoiceNumber: { in: INVOICE_NUMBERS } },
    select: {
      id: true,
      invoiceNumber: true,
      payPeriodId: true,
      payPeriod: { select: { cutoffDate: true, label: true } },
      client: { select: { lniClaimNumber: true, lastName: true, firstName: true } },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  console.log(`Pay period: ${payPeriod.cutoffDate.toISOString().slice(0, 10)} (${payPeriod.label ?? "no label"})`);
  console.log(`Found ${invoices.length}/${INVOICE_NUMBERS.length} invoices`);

  const missing = INVOICE_NUMBERS.filter((n) => !invoices.some((i) => i.invoiceNumber === n));
  if (missing.length) console.log("Missing invoice numbers:", missing);

  for (const inv of invoices) {
    const current = inv.payPeriod?.cutoffDate.toISOString().slice(0, 10) ?? "unassigned";
    const ok = inv.payPeriodId === payPeriod.id;
    console.log(
      `#${inv.invoiceNumber} ${inv.client.lniClaimNumber} ${inv.client.lastName} current=${current} ${ok ? "OK" : "NEEDS_UPDATE"}`,
    );
  }

  const toUpdate = invoices.filter((inv) => inv.payPeriodId !== payPeriod.id);
  if (!fix) {
    console.log(`\nDry run: would update ${toUpdate.length} invoice(s). Re-run with --fix to apply.`);
    await prisma.$disconnect();
    return;
  }

  if (toUpdate.length === 0) {
    console.log("All invoices already assigned correctly.");
    await prisma.$disconnect();
    return;
  }

  await prisma.invoice.updateMany({
    where: { id: { in: toUpdate.map((i) => i.id) } },
    data: { payPeriodId: payPeriod.id },
  });

  console.log(`Updated ${toUpdate.length} invoice(s) to pay period ${CUTOFF_ISO}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
