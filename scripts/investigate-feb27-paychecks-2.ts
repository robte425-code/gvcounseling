import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const ras = await prisma.remittanceAdvice.findMany({
    where: { invoiceDate: { gte: new Date("2026-02-15"), lte: new Date("2026-03-20") } },
    select: {
      remittanceNumber: true,
      invoiceDate: true,
      status: true,
      sourceFilename: true,
      payRun: {
        select: {
          payouts: {
            select: {
              therapist: { select: { email: true, firstName: true, lastName: true } },
              therapistAmount: true,
              invoiceCount: true,
            },
          },
        },
      },
    },
    orderBy: { invoiceDate: "asc" },
  });

  console.log("=== All RAs Feb 15 - Mar 20 ===");
  for (const r of ras) {
    console.log(
      r.remittanceNumber,
      r.invoiceDate.toISOString().slice(0, 10),
      r.status,
      r.sourceFilename,
      r.payRun?.payouts.length ?? 0,
      "payouts",
    );
  }

  const mar3 = await prisma.invoice.findMany({
    where: { lniPaidAt: { gte: new Date("2026-03-03"), lt: new Date("2026-03-04") } },
    select: {
      invoiceNumber: true,
      therapist: { select: { firstName: true, lastName: true, email: true } },
      paymentStatus: true,
      payPeriod: { select: { label: true } },
      remittanceLines: {
        where: { supersededAt: null },
        select: {
          remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
        },
      },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  console.log(`\n=== Invoices with lniPaidAt Mar 3 (${mar3.length}) ===`);
  for (const i of mar3) {
    console.log(
      `#${i.invoiceNumber}`,
      i.therapist.firstName,
      i.payPeriod?.label,
      i.remittanceLines.map(
        (l) =>
          `${l.remittanceAdvice.remittanceNumber} ${l.remittanceAdvice.invoiceDate.toISOString().slice(0, 10)}`,
      ),
    );
  }

  const periods = await prisma.payPeriod.findMany({
    where: { paymentDate: { not: null } },
    orderBy: { paymentDate: "asc" },
    select: { label: true, cutoffDate: true, paymentDate: true },
  });
  console.log("\n=== L&I schedule Q1 2026 ===");
  for (const p of periods.filter(
    (p) => p.paymentDate && p.paymentDate >= new Date("2026-01-01") && p.paymentDate <= new Date("2026-04-30"),
  )) {
    const hasRa = ras.some(
      (r) => r.invoiceDate.toISOString().slice(0, 10) === p.paymentDate!.toISOString().slice(0, 10),
    );
    console.log(
      p.label,
      "cutoff",
      p.cutoffDate.toISOString().slice(0, 10),
      "pay",
      p.paymentDate?.toISOString().slice(0, 10),
      hasRa ? "RA:yes" : "RA:MISSING",
    );
  }

  // Maria Feb 27 billed invoices - where did they actually get paid?
  const maria = await prisma.user.findFirst({
    where: { email: { contains: "maria", mode: "insensitive" } },
  });
  if (maria) {
    const feb27 = await prisma.payPeriod.findFirst({ where: { label: { contains: "Feb 27, 2026" } } });
    if (feb27) {
      const invs = await prisma.invoice.findMany({
        where: { therapistId: maria.id, payPeriodId: feb27.id },
        select: {
          invoiceNumber: true,
          paymentStatus: true,
          payRunLines: {
            include: {
              payout: {
                include: {
                  payRun: {
                    include: {
                      remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { invoiceNumber: "asc" },
      });
      console.log(`\n=== Maria Feb 27 billed - pay run mapping ===`);
      for (const inv of invs) {
        const pr = inv.payRunLines[0];
        const ra = pr?.payout.payRun.remittanceAdvice;
        console.log(
          `#${inv.invoiceNumber}`,
          inv.paymentStatus,
          ra ? `RA ${ra.remittanceNumber} ${ra.invoiceDate.toISOString().slice(0, 10)}` : "no pay run",
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
