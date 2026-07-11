import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { formatDate } = await import("../src/lib/constants");

  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 1021 },
    include: {
      remittanceLines: {
        include: {
          remittanceAdvice: {
            select: {
              remittanceNumber: true,
              invoiceDate: true,
              sourceFilename: true,
            },
          },
        },
      },
      payRunLines: {
        include: {
          payout: {
            include: {
              payRun: {
                include: {
                  remittanceAdvice: {
                    select: { remittanceNumber: true, invoiceDate: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(
    "Remittance lines:",
    JSON.stringify(
      inv?.remittanceLines.map((l) => ({
        section: l.section,
        payable: Number(l.billTotalPayable),
        ra: l.remittanceAdvice.remittanceNumber,
        raDate: l.remittanceAdvice.invoiceDate,
        file: l.remittanceAdvice.sourceFilename,
      })),
      null,
      2,
    ),
  );

  console.log(
    "Pay run lines:",
    JSON.stringify(
      inv?.payRunLines.map((l) => ({
        amount: Number(l.amount),
        ra: l.payout.payRun.remittanceAdvice.remittanceNumber,
        raDate: l.payout.payRun.remittanceAdvice.invoiceDate,
      })),
      null,
      2,
    ),
  );

  const feb = await prisma.payPeriod.findMany({
    where: {
      cutoffDate: { gte: new Date("2026-01-01"), lte: new Date("2026-03-15") },
    },
    orderBy: { cutoffDate: "asc" },
  });
  console.log("\nJan–Mar 2026 pay periods:");
  for (const p of feb) {
    console.log(
      "-",
      p.label,
      "cutoff",
      formatDate(p.cutoffDate),
      "payment",
      p.paymentDate ? formatDate(p.paymentDate) : "—",
    );
  }

  if (inv?.billedAt) {
    const dayStart = new Date(
      Date.UTC(inv.billedAt.getUTCFullYear(), inv.billedAt.getUTCMonth(), inv.billedAt.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const byPayment = await prisma.payPeriod.findFirst({
      where: { paymentDate: { gte: dayStart, lt: dayEnd } },
    });
    console.log(
      "\nPay period matching billedAt (2026-02-12):",
      byPayment
        ? `${byPayment.label} cutoff ${formatDate(byPayment.cutoffDate)} payment ${
            byPayment.paymentDate ? formatDate(byPayment.paymentDate) : "—"
          }`
        : "none",
    );

    const byService = await prisma.payPeriod.findFirst({
      where: { cutoffDate: { gte: new Date("2026-02-05") } },
      orderBy: { cutoffDate: "asc" },
    });
    console.log(
      "First pay period with cutoff on/after DOS 2026-02-05:",
      byService
        ? `${byService.label} cutoff ${formatDate(byService.cutoffDate)} payment ${
            byService.paymentDate ? formatDate(byService.paymentDate) : "—"
          }`
        : "none",
    );
  }

  // Count how many other billed Maria invoices from similar import lack pay period
  const similar = await prisma.invoice.count({
    where: {
      therapist: { email: "maria@gvcounseling.com" },
      payPeriodId: null,
      status: "BILLED",
    },
  });
  console.log("\nOther Maria BILLED invoices with no pay period:", similar);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
