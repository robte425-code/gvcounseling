import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function main() {
  const psych = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      lineItems: { some: { procedureCode: { in: ["90832", "90834", "90837"] } } },
    },
    select: {
      invoiceNumber: true,
      paymentStatus: true,
      client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
      _count: { select: { remittanceLines: true } },
    },
    orderBy: { invoiceNumber: "asc" },
  });
  console.log({
    total: psych.length,
    paid: psych.filter((i) => i.paymentStatus === "PAID").length,
    denied: psych.filter((i) => i.paymentStatus === "DENIED"),
    unpaid: psych.filter((i) => i.paymentStatus === "UNPAID" || !i.paymentStatus),
    paidNoRa: psych.filter((i) => i.paymentStatus === "PAID" && i._count.remittanceLines === 0),
  });
  await prisma.$disconnect();
}
main();
