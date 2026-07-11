import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function main() {
  for (const claim of ["BM32698", "ZB71415", "BK47305", "BG46680", "BM71187"]) {
    const lines = await prisma.remittanceAdviceLine.findMany({
      where: { claimNumber: claim, supersededAt: null, remittanceAdvice: { status: "APPLIED" } },
      include: {
        remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
        matchedInvoice: { select: { invoiceNumber: true } },
      },
      orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
    });
    console.log(`\n${claim} (${lines.length} lines)`);
    for (const l of lines) {
      console.log(
        l.remittanceAdvice.remittanceNumber,
        l.section,
        "inv",
        l.matchedInvoice?.invoiceNumber ?? "-",
        JSON.stringify(l.serviceLines).slice(0, 100),
      );
    }
  }
  await prisma.$disconnect();
}
main();
