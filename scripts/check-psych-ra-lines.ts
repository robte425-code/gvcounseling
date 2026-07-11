import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function main() {
  for (const claim of ["BK47305", "BM70906"]) {
    const lines = await prisma.remittanceAdviceLine.findMany({
      where: {
        claimNumber: claim,
        supersededAt: null,
        remittanceAdvice: { status: "APPLIED" },
      },
      include: {
        remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
        matchedInvoice: { select: { invoiceNumber: true } },
      },
      orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
    });
    console.log(`\n${claim} (${lines.length} lines)`);
    for (const l of lines) {
      const sl = JSON.stringify(l.serviceLines);
      if (sl.includes("9083") || claim === "BM70906") {
        console.log(
          l.remittanceAdvice.remittanceNumber,
          l.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
          l.section,
          "inv",
          l.matchedInvoice?.invoiceNumber ?? "-",
          sl.slice(0, 120),
        );
      }
    }
  }

  const inv523 = await prisma.invoice.findFirst({
    where: { invoiceNumber: 523 },
    include: {
      remittanceLines: {
        include: { remittanceAdvice: { select: { remittanceNumber: true } } },
      },
      lineItems: true,
    },
  });
  console.log("\n#523", inv523?.paymentStatus, inv523?.remittanceLines);

  for (const raNum of ["59241", "64667", "70106", "75265"]) {
    const lines = await prisma.remittanceAdviceLine.findMany({
      where: {
        claimNumber: { in: ["BK47305", "BM70906"] },
        supersededAt: null,
        remittanceAdvice: { remittanceNumber: raNum },
      },
      include: {
        remittanceAdvice: { select: { remittanceNumber: true } },
        matchedInvoice: { select: { invoiceNumber: true } },
      },
    });
    if (lines.length) {
      console.log(`\nRA ${raNum}`);
      for (const l of lines) {
        console.log(l.claimNumber, l.section, l.matchedInvoice?.invoiceNumber, JSON.stringify(l.serviceLines).slice(0, 90));
      }
    }
  }

  await prisma.$disconnect();
}
main();
