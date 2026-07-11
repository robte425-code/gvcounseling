import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { formatDate } = await import("../src/lib/constants");
  const { payPeriodLabel } = await import("../src/lib/invoice-pay-period-grouping");

  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 1021 },
    include: {
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      therapist: { select: { firstName: true, lastName: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      remittanceLines: {
        include: {
          remittanceAdvice: true,
        },
      },
    },
  });
  if (!inv) throw new Error("Invoice 1021 not found");

  console.log("=== Invoice 1021 ===");
  console.log({
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    lniPaidAt: inv.lniPaidAt,
    total: Number(inv.totalAmount),
    claim: inv.client.lniClaimNumber,
    client: `${inv.client.lastName}, ${inv.client.firstName}`,
    therapist: `${inv.therapist.firstName} ${inv.therapist.lastName}`,
    dos: inv.lineItems.map((l) => ({
      date: l.serviceDate.toISOString().slice(0, 10),
      code: l.procedureCode,
      amount: Number(l.amount),
      units: l.units,
    })),
    payPeriodId: inv.payPeriodId,
  });

  for (const line of inv.remittanceLines) {
    const ra = line.remittanceAdvice;
    console.log("\n=== Matched remittance line ===");
    console.log({
      section: line.section,
      claimNumber: line.claimNumber,
      icn: line.icn,
      patientName: line.patientName,
      billTotalPayable: Number(line.billTotalPayable),
      eobCodes: line.eobCodes,
      matchNote: line.matchNote,
      supersededAt: line.supersededAt,
      serviceLines: line.serviceLines,
    });

    console.log("\n=== Remittance advice ===");
    console.log({
      remittanceNumber: ra.remittanceNumber,
      invoiceDate: ra.invoiceDate,
      reportDate: ra.reportDate,
      warrantRegister: ra.warrantRegister,
      payeeNumber: ra.payeeNumber,
      payeeName: ra.payeeName,
      totalPaid: ra.totalPaid != null ? Number(ra.totalPaid) : null,
      status: ra.status,
      sourceFilename: ra.sourceFilename,
      appliedAt: ra.appliedAt,
    });

    // All lines on this RA for same claim / nearby
    const siblings = await prisma.remittanceAdviceLine.findMany({
      where: {
        remittanceAdviceId: ra.id,
        OR: [
          { claimNumber: inv.client.lniClaimNumber },
          { matchedInvoiceId: inv.id },
          { patientName: { contains: "Rivera", mode: "insensitive" } },
          { patientName: { contains: "Alonso", mode: "insensitive" } },
        ],
      },
      orderBy: { icn: "asc" },
    });
    console.log("\n=== RA lines for claim / Rivera / this invoice ===");
    for (const s of siblings) {
      console.log({
        section: s.section,
        claim: s.claimNumber,
        icn: s.icn,
        patient: s.patientName,
        payable: Number(s.billTotalPayable),
        matchedInvoiceId: s.matchedInvoiceId,
        eob: s.eobCodes,
        serviceLines: s.serviceLines,
        matchNote: s.matchNote,
        supersededAt: s.supersededAt,
      });
    }

    // Pay period whose paymentDate matches RA invoiceDate (paycheck logic)
    const raDay = ra.invoiceDate;
    const dayStart = new Date(
      Date.UTC(raDay.getUTCFullYear(), raDay.getUTCMonth(), raDay.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const exactPayment = await prisma.payPeriod.findFirst({
      where: { paymentDate: { gte: dayStart, lt: dayEnd } },
    });
    console.log(
      "\nPay period with paymentDate = RA invoiceDate:",
      exactPayment
        ? `${payPeriodLabel(exactPayment)} cutoff ${formatDate(exactPayment.cutoffDate)} payment ${
            exactPayment.paymentDate ? formatDate(exactPayment.paymentDate) : "—"
          }`
        : "none",
    );

    // Nearby payment dates
    const nearby = await prisma.payPeriod.findMany({
      where: {
        paymentDate: {
          gte: new Date(dayStart.getTime() - 7 * 86400000),
          lte: new Date(dayStart.getTime() + 7 * 86400000),
        },
      },
      orderBy: { paymentDate: "asc" },
    });
    console.log("\nPay periods with paymentDate within ±7 days of RA date:");
    for (const p of nearby) {
      console.log(
        `- ${payPeriodLabel(p)} cutoff ${formatDate(p.cutoffDate)} payment ${
          p.paymentDate ? formatDate(p.paymentDate) : "—"
        }`,
      );
    }

    // Therapist pay run for this RA
    const payRun = await prisma.therapistPayRun.findUnique({
      where: { remittanceAdviceId: ra.id },
      include: {
        payouts: {
          include: {
            therapist: { select: { firstName: true, lastName: true, email: true } },
            lines: {
              where: { invoiceId: inv.id },
              include: {
                invoice: { select: { invoiceNumber: true, totalAmount: true } },
              },
            },
          },
        },
      },
    });
    console.log("\n=== Therapist pay run for this RA ===");
    if (!payRun) {
      console.log("No pay run found");
    } else {
      console.log({ status: payRun.status, finalizedAt: payRun.finalizedAt });
      for (const payout of payRun.payouts) {
        if (payout.lines.length === 0 && !payout.therapist.email.includes("maria")) continue;
        console.log({
          therapist: `${payout.therapist.firstName} ${payout.therapist.lastName}`,
          email: payout.therapist.email,
          linesFor1021: payout.lines.map((l) => ({
            invoice: l.invoice.invoiceNumber,
            invoiceTotal: Number(l.invoice.totalAmount),
            lniPaid: Number(l.lniPaidAmount),
            therapistAmount: Number(l.therapistAmount),
          })),
        });
      }
      // specifically maria payout lines for this invoice
      const mariaLines = payRun.payouts.flatMap((p) =>
        p.lines
          .filter((l) => l.invoiceId === inv.id)
          .map((l) => ({
            therapist: `${p.therapist.firstName} ${p.therapist.lastName}`,
            lniPaid: Number(l.lniPaidAmount),
            therapistAmount: Number(l.therapistAmount),
          })),
      );
      console.log("Pay run lines specifically for invoice 1021:", mariaLines);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
