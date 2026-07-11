import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const steven = await prisma.user.findUnique({ where: { email: "steven@gvcounseling.com" } });
  const feb27 = await prisma.payPeriod.findFirst({ where: { label: { contains: "Feb 27, 2026" } } });
  if (!steven || !feb27) throw new Error("missing data");

  const invs = await prisma.invoice.findMany({
    where: { therapistId: steven.id, payPeriodId: feb27.id },
    select: {
      invoiceNumber: true,
      paymentStatus: true,
      lniPaidAt: true,
      payRunLines: {
        include: {
          payout: {
            include: {
              payRun: {
                include: {
                  remittanceAdvice: {
                    select: { remittanceNumber: true, invoiceDate: true, sourceFilename: true },
                  },
                },
              },
            },
          },
        },
      },
      remittanceLines: {
        where: { supersededAt: null },
        select: {
          section: true,
          remittanceAdvice: {
            select: { remittanceNumber: true, invoiceDate: true },
          },
        },
      },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  console.log("=== Steven Feb 27 billed invoices ===");
  for (const inv of invs) {
    const pr = inv.payRunLines[0];
    const ra = pr?.payout.payRun.remittanceAdvice;
    console.log(
      `#${inv.invoiceNumber}`,
      inv.paymentStatus,
      `lniPaidAt=${inv.lniPaidAt?.toISOString().slice(0, 10) ?? "null"}`,
      `payRun=${ra ? `RA ${ra.remittanceNumber} ${ra.invoiceDate.toISOString().slice(0, 10)}` : "none"}`,
      `raLines=${inv.remittanceLines.map((l) => `${l.remittanceAdvice.remittanceNumber}/${l.section}`).join(",") || "none"}`,
    );
  }

  // Check if Mar 3 RA exists anywhere (preview, unapplied)
  const mar3Ras = await prisma.remittanceAdvice.findMany({
    where: {
      OR: [
        { invoiceDate: { gte: new Date("2026-03-02"), lt: new Date("2026-03-04") } },
        { sourceFilename: { contains: "332026" } },
        { sourceFilename: { contains: "3302026" } },
        { sourceFilename: { contains: "332026" } },
      ],
    },
    select: { remittanceNumber: true, invoiceDate: true, status: true, sourceFilename: true },
  });
  console.log("\n=== Any Mar 3 RA records ===", mar3Ras);

  // List all paycheck summaries for Steven
  const { loadPaycheckSummaries } = await import("../src/lib/paychecks");
  const summaries = await loadPaycheckSummaries({ therapistId: steven.id });
  console.log("\n=== Steven paychecks (portal) ===");
  for (const s of summaries.filter((x) => x.paymentDateLabel?.includes("2026") || x.payPeriodLabel.includes("2026"))) {
    console.log(s.payPeriodLabel, "pay", s.paymentDateLabel, `$${s.therapistAmount}`, `${s.invoiceCount} inv`);
  }

  const maria = await prisma.user.findFirst({ where: { email: { contains: "maria", mode: "insensitive" } } });
  if (maria) {
    const mariaSummaries = await loadPaycheckSummaries({ therapistId: maria.id });
    console.log("\n=== Maria paychecks (portal) Q1 2026 ===");
    for (const s of mariaSummaries.filter((x) => {
      const d = x.paymentDateLabel ?? "";
      return d.includes("2026-01") || d.includes("2026-02") || d.includes("2026-03") || d.includes("Jan") || d.includes("Feb") || d.includes("Mar");
    })) {
      console.log(s.payPeriodLabel, "pay", s.paymentDateLabel, `$${s.therapistAmount}`, `${s.invoiceCount} inv`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
