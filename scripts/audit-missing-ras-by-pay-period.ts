import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { calendarIsoFromDate } = await import("../src/lib/constants");

  const [payPeriods, ras] = await Promise.all([
    prisma.payPeriod.findMany({
      where: { paymentDate: { not: null } },
      orderBy: { paymentDate: "asc" },
      select: { id: true, label: true, cutoffDate: true, paymentDate: true },
    }),
    prisma.remittanceAdvice.findMany({
      where: { status: "APPLIED" },
      select: {
        remittanceNumber: true,
        invoiceDate: true,
        sourceFilename: true,
        payRun: { select: { id: true } },
      },
      orderBy: { invoiceDate: "asc" },
    }),
  ]);

  const raByPaymentIso = new Map<string, (typeof ras)[number][]>();
  for (const ra of ras) {
    const iso = calendarIsoFromDate(ra.invoiceDate);
    const list = raByPaymentIso.get(iso) ?? [];
    list.push(ra);
    raByPaymentIso.set(iso, list);
  }

  const missing: Array<{
    label: string;
    cutoff: string;
    payment: string;
    expectedFilename: string;
  }> = [];
  const present: Array<{
    label: string;
    payment: string;
    ras: string[];
  }> = [];

  for (const period of payPeriods) {
    if (!period.paymentDate) continue;
    const paymentIso = calendarIsoFromDate(period.paymentDate);
    const matches = raByPaymentIso.get(paymentIso) ?? [];
    const realRas = matches.filter((r) => !r.remittanceNumber.includes("SPREADSHEET"));

    const label = period.label ?? paymentIso;
    const cutoff = period.cutoffDate.toISOString().slice(0, 10);
    const payment = paymentIso;

    // Guess expected filename pattern: M/D/YYYY without leading zeros
    const d = period.paymentDate;
    const expectedFilename = `RemittanceAdvice_0479998_${d.getUTCMonth() + 1}${d.getUTCDate()}${d.getUTCFullYear()}.pdf`;

    if (!realRas.length) {
      missing.push({ label, cutoff, payment, expectedFilename });
    } else {
      present.push({
        label,
        payment,
        ras: realRas.map((r) => `${r.remittanceNumber} (${r.sourceFilename})`),
      });
    }
  }

  // Also find RAs that don't match any pay period payment date
  const payPeriodPaymentIsos = new Set(
    payPeriods.filter((p) => p.paymentDate).map((p) => calendarIsoFromDate(p.paymentDate!)),
  );
  const orphanRas = ras.filter((ra) => {
    if (ra.remittanceNumber.includes("SPREADSHEET")) return false;
    return !payPeriodPaymentIsos.has(calendarIsoFromDate(ra.invoiceDate));
  });

  console.log("=== Pay periods WITH applied RA (" + present.length + ") ===");
  for (const row of present) {
    console.log(`${row.label} (pay ${row.payment}): ${row.ras.join(", ")}`);
  }

  console.log("\n=== Pay periods MISSING applied RA (" + missing.length + ") ===");
  for (const row of missing) {
    console.log(`${row.label} | cutoff ${row.cutoff} | pay ${row.payment} | expected ~${row.expectedFilename}`);
  }

  console.log("\n=== Applied RAs with no matching pay period payment date (" + orphanRas.length + ") ===");
  for (const ra of orphanRas) {
    console.log(
      `${ra.remittanceNumber} | ${ra.invoiceDate.toISOString().slice(0, 10)} | ${ra.sourceFilename}`,
    );
  }

  // Summary by year
  const byYear = new Map<string, { missing: number; present: number }>();
  for (const row of missing) {
    const y = row.payment.slice(0, 4);
    const cur = byYear.get(y) ?? { missing: 0, present: 0 };
    cur.missing++;
    byYear.set(y, cur);
  }
  for (const row of present) {
    const y = row.payment.slice(0, 4);
    const cur = byYear.get(y) ?? { missing: 0, present: 0 };
    cur.present++;
    byYear.set(y, cur);
  }
  console.log("\n=== Summary by year ===");
  for (const [year, counts] of [...byYear.entries()].sort()) {
    console.log(`${year}: ${counts.present} with RA, ${counts.missing} missing`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
