import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { resolvePaymentFromRemittanceLines, remittanceSectionToPaymentStatus } from "../src/lib/invoice-payment-status";
import { prisma } from "../src/lib/prisma";

async function main() {
  const nums = [987, 988];
  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: nums } },
    include: {
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      therapist: { select: { email: true, firstName: true, lastName: true } },
      lineItems: { select: { serviceDate: true, procedureCode: true, amount: true } },
      remittanceLines: {
        where: { supersededAt: null },
        include: {
          remittanceAdvice: {
            select: {
              id: true,
              remittanceNumber: true,
              warrantRegister: true,
              invoiceDate: true,
              status: true,
              appliedAt: true,
            },
          },
        },
        orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
      },
    },
  });

  for (const inv of invoices) {
    const resolved = resolvePaymentFromRemittanceLines(
      inv.remittanceLines.map((l) => ({
        paymentStatus: remittanceSectionToPaymentStatus(l.section),
        remittanceDate: l.remittanceAdvice.invoiceDate,
        eobCodes: l.eobCodes,
        eobCodeDescriptions: l.eobCodeDescriptions as Record<string, string>,
      })),
    );
    console.log("---");
    console.log({
      invoiceNumber: inv.invoiceNumber,
      client: `${inv.client.firstName} ${inv.client.lastName}`,
      claim: inv.client.lniClaimNumber,
      therapist: inv.therapist.email,
      paymentStatus: inv.paymentStatus,
      lniPaidAt: inv.lniPaidAt,
      status: inv.status,
      submittedAt: inv.submittedAt,
      totalAmount: inv.totalAmount,
      lineItems: inv.lineItems.map((li) => ({
        dos: li.serviceDate.toISOString().slice(0, 10),
        code: li.procedureCode,
        amount: li.amount,
      })),
      resolvedFromLines: resolved,
      lineCount: inv.remittanceLines.length,
    });
  }

  for (const raNum of ["70106"]) {
    const ra = await prisma.remittanceAdvice.findFirst({
      where: { remittanceNumber: raNum },
      include: {
        _count: { select: { lines: true } },
        lines: {
          where: { claimNumber: { in: ["BJ87697", "BM70906"] }, supersededAt: null },
          include: { matchedInvoice: { select: { invoiceNumber: true } } },
        },
      },
    });
    console.log(`\n=== RA ${raNum} total lines ${ra?._count.lines} ===`);
    const allLines = await prisma.remittanceAdviceLine.findMany({
      where: { remittanceAdvice: { remittanceNumber: raNum } },
      include: { matchedInvoice: { select: { invoiceNumber: true } } },
      orderBy: { claimNumber: "asc" },
    });
    for (const l of allLines) {
      console.log(
        l.claimNumber,
        l.section,
        Number(l.billTotalPayable),
        "inv",
        l.matchedInvoice?.invoiceNumber ?? "-",
        JSON.stringify(l.serviceLines).slice(0, 100),
      );
    }
    for (const l of ra?.lines ?? []) {
      console.log(
        l.claimNumber,
        l.section,
        "matched",
        l.matchedInvoice?.invoiceNumber ?? "none",
        "bill",
        l.billTotalPayable,
        JSON.stringify(l.serviceLines),
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
