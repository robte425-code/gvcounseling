import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function main() {
  const psych = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      paymentStatus: "PAID",
      lineItems: { some: { procedureCode: { in: ["90832", "90834", "90837"] } } },
      remittanceLines: { none: { supersededAt: null } },
    },
    select: { id: true, invoiceNumber: true },
  });

  for (const inv of psych) {
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        paymentStatus: "UNPAID",
        lniPaidAt: null,
        lniEobCodes: [],
        lniEobCodeDescriptions: {},
      },
    });
    console.log(`#${inv.invoiceNumber} PAID -> UNPAID (no RA line)`);
  }

  if (psych.length === 0) console.log("No psychotherapy invoices to fix.");
  await prisma.$disconnect();
}

main();
