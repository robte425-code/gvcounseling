import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { calendarIsoFromDate } = await import("../src/lib/constants");

  const therapists = await prisma.user.findMany({
    where: {
      OR: [
        { email: "steven@gvcounseling.com" },
        { email: { contains: "maria", mode: "insensitive" } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const payPeriods = await prisma.payPeriod.findMany({
    where: {
      OR: [
        { label: { contains: "Feb 27, 2026" } },
        { cutoffDate: { gte: new Date("2026-02-01"), lte: new Date("2026-03-15") } },
      ],
    },
    orderBy: { cutoffDate: "asc" },
    select: { id: true, label: true, cutoffDate: true, paymentDate: true },
  });

  console.log("=== Pay periods around Feb 2026 ===");
  for (const p of payPeriods) {
    console.log({
      label: p.label,
      cutoff: p.cutoffDate.toISOString().slice(0, 10),
      payment: p.paymentDate?.toISOString().slice(0, 10) ?? null,
    });
  }

  const feb27 = payPeriods.find((p) => p.label?.includes("Feb 27, 2026"));
  if (!feb27?.paymentDate) {
    console.log("\nNo Feb 27 2026 pay period with paymentDate found");
  } else {
    const paymentIso = calendarIsoFromDate(feb27.paymentDate);
    console.log(`\n=== Feb 27 period payment date: ${paymentIso} ===`);

    const ras = await prisma.remittanceAdvice.findMany({
      where: {
        status: "APPLIED",
        invoiceDate: {
          gte: new Date(feb27.paymentDate.getTime() - 2 * 86400000),
          lte: new Date(feb27.paymentDate.getTime() + 2 * 86400000),
        },
      },
      select: {
        remittanceNumber: true,
        invoiceDate: true,
        sourceFilename: true,
        payRun: {
          select: {
            status: true,
            payouts: {
              select: {
                therapistId: true,
                therapistAmount: true,
                invoiceCount: true,
                therapist: { select: { firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: { invoiceDate: "asc" },
    });

    console.log(`\n=== RAs near payment date (${ras.length}) ===`);
    for (const ra of ras) {
      console.log({
        ra: ra.remittanceNumber,
        invoiceDate: ra.invoiceDate.toISOString().slice(0, 10),
        file: ra.sourceFilename,
        payRunStatus: ra.payRun?.status ?? null,
        payouts: ra.payRun?.payouts.map((p) => ({
          therapist: `${p.therapist.firstName} ${p.therapist.lastName}`,
          email: p.therapist.email,
          amount: Number(p.therapistAmount),
          invoices: p.invoiceCount,
        })),
      });
    }

    for (const t of therapists) {
      const payouts = await prisma.therapistPayRunPayout.findMany({
        where: { therapistId: t.id },
        include: {
          payRun: {
            include: {
              remittanceAdvice: {
                select: { remittanceNumber: true, invoiceDate: true, sourceFilename: true },
              },
            },
          },
        },
      });

      const onFeb27Payment = payouts.filter(
        (p) => calendarIsoFromDate(p.payRun.remittanceAdvice.invoiceDate) === paymentIso,
      );

      console.log(`\n=== ${t.firstName} ${t.lastName} payouts on Feb 27 payment date ===`);
      if (!onFeb27Payment.length) {
        console.log("  NONE");

        const nearby = payouts
          .map((p) => ({
            ra: p.payRun.remittanceAdvice.remittanceNumber,
            date: p.payRun.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
            amount: Number(p.therapistAmount),
            invoices: p.invoiceCount,
          }))
          .filter((p) => p.date >= "2026-01-15" && p.date <= "2026-04-15")
          .sort((a, b) => a.date.localeCompare(b.date));

        console.log("  Nearby payouts Jan–Apr 2026:");
        for (const p of nearby) console.log("   ", p);
      } else {
        for (const p of onFeb27Payment) {
          console.log({
            ra: p.payRun.remittanceAdvice.remittanceNumber,
            amount: Number(p.therapistAmount),
            invoices: p.invoiceCount,
          });
        }
      }

      const billedFeb27 = await prisma.invoice.findMany({
        where: {
          therapistId: t.id,
          payPeriodId: feb27.id,
        },
        select: {
          invoiceNumber: true,
          paymentStatus: true,
          lniPaidAt: true,
          totalAmount: true,
          client: { select: { lastName: true, lniClaimNumber: true } },
        },
        orderBy: { invoiceNumber: "asc" },
      });

      console.log(`  Invoices billed in Feb 27 period (${billedFeb27.length}):`);
      for (const inv of billedFeb27) {
        console.log(
          `    #${inv.invoiceNumber} ${inv.client.lastName} ${inv.client.lniClaimNumber} status=${inv.paymentStatus} lniPaid=${inv.lniPaidAt?.toISOString().slice(0, 10) ?? "null"}`,
        );
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
