import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const periods = await prisma.payPeriod.findMany({
    where: { cutoffDate: { gte: new Date("2026-06-25"), lte: new Date("2026-07-10") } },
    orderBy: { cutoffDate: "asc" },
    include: {
      bills: { select: { id: true, filename: true, generatedAt: true, invoiceCount: true } },
      invoices: {
        select: {
          invoiceNumber: true,
          status: true,
          billId: true,
          therapist: { select: { lastName: true } },
        },
        orderBy: { invoiceNumber: "asc" },
      },
      _count: { select: { invoices: true, bills: true } },
    },
  });

  for (const period of periods) {
    const ready = period.invoices.filter((i) => !i.billId);
    const onBill = period.invoices.filter((i) => i.billId);
    console.log(
      `\n--- ${period.label ?? "(no label)"} | cutoff ${period.cutoffDate.toISOString().slice(0, 10)}`,
    );
    console.log(
      `assigned: ${period._count.invoices} | ready (no bill): ${ready.length} | on bill: ${onBill.length} | 837 files: ${period._count.bills}`,
    );
    if (period.bills.length) {
      console.table(
        period.bills.map((b) => ({
          filename: b.filename,
          claims: b.invoiceCount,
          generated: b.generatedAt.toISOString().slice(0, 16),
          id: b.id,
        })),
      );
    }
    if (ready.length === 0 && onBill.length > 0) {
      console.log("All assigned invoices are already on a bill — generate a new 837 only after adding new invoices to this pay period.");
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
