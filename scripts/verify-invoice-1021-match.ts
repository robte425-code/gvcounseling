import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { formatDate } = await import("../src/lib/constants");

  // All invoices for BL13687 around Feb 2026
  const invoices = await prisma.invoice.findMany({
    where: {
      client: { lniClaimNumber: "BL13687" },
      OR: [
        { lineItems: { some: { serviceDate: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") } } } },
        { invoiceNumber: 1021 },
      ],
    },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      payPeriod: { select: { label: true, cutoffDate: true, paymentDate: true } },
      remittanceLines: {
        select: {
          id: true,
          section: true,
          icn: true,
          billTotalPayable: true,
          serviceLines: true,
          remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
        },
      },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  console.log("=== Invoices for BL13687 with Feb 2026 DOS ===");
  for (const inv of invoices) {
    console.log({
      invoice: inv.invoiceNumber,
      status: inv.status,
      paymentStatus: inv.paymentStatus,
      total: Number(inv.totalAmount),
      payPeriod: inv.payPeriod
        ? `${inv.payPeriod.label} pay ${inv.payPeriod.paymentDate ? formatDate(inv.payPeriod.paymentDate) : "—"}`
        : null,
      lines: inv.lineItems.map((l) => `${l.serviceDate.toISOString().slice(0, 10)} ${l.procedureCode} $${Number(l.amount)}`),
      raMatches: inv.remittanceLines.map((l) => ({
        ra: l.remittanceAdvice.remittanceNumber,
        raDate: l.remittanceAdvice.invoiceDate?.toISOString().slice(0, 10),
        section: l.section,
        icn: l.icn,
        payable: Number(l.billTotalPayable),
        codes: Array.isArray(l.serviceLines)
          ? (l.serviceLines as { procedureCode?: string }[]).map((s) => s.procedureCode)
          : l.serviceLines,
      })),
    });
  }

  // All RA 31270 lines for BL13687
  const ra = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber: "31270" },
    include: {
      lines: {
        where: { claimNumber: "BL13687" },
      },
    },
  });
  console.log("\n=== All RA 31270 lines for claim BL13687 ===");
  for (const l of ra?.lines ?? []) {
    console.log({
      section: l.section,
      icn: l.icn,
      patient: l.patientName,
      payable: Number(l.billTotalPayable),
      matchedInvoiceId: l.matchedInvoiceId,
      serviceLines: l.serviceLines,
    });
  }

  // Search any remittance line with 96156 + BL13687 + Feb 5
  const allLines = await prisma.remittanceAdviceLine.findMany({
    where: { claimNumber: "BL13687" },
    include: {
      remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true, sourceFilename: true } },
      matchedInvoice: { select: { invoiceNumber: true } },
    },
    orderBy: { remittanceAdviceId: "asc" },
  });

  console.log("\n=== All remittance lines ever for BL13687 ===");
  for (const l of allLines) {
    const codes = Array.isArray(l.serviceLines)
      ? (l.serviceLines as { procedureCode?: string; serviceDateFrom?: string; payable?: number }[])
      : [];
    console.log({
      ra: l.remittanceAdvice.remittanceNumber,
      raDate: l.remittanceAdvice.invoiceDate?.toISOString().slice(0, 10),
      section: l.section,
      icn: l.icn,
      payable: Number(l.billTotalPayable),
      matchedInvoice: l.matchedInvoice?.invoiceNumber ?? null,
      codes: codes.map((c) => `${c.serviceDateFrom} ${c.procedureCode} $${c.payable}`),
      file: l.remittanceAdvice.sourceFilename,
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
