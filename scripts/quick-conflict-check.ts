import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

const nums = [64, 93, 106, 120, 185, 215, 217, 246, 356, 606, 805, 840, 850, 851, 853, 861, 897, 906, 956];

async function main() {
  const auditInvoices = await prisma.invoice.findMany({
    where: { status: "BILLED", paymentStatus: { not: "PAID" }, payRunLines: { some: {} } },
    select: { invoiceNumber: true, paymentStatus: true, client: { select: { firstName: true, lastName: true } } },
    orderBy: { invoiceNumber: "asc" },
  });
  console.log("audit query:", auditInvoices.length, auditInvoices.map((i) => `#${i.invoiceNumber} ${i.paymentStatus} ${i.client.firstName}`).join("; "));

  const dup106 = await prisma.invoice.findMany({ where: { invoiceNumber: 106 } });
  const dup217 = await prisma.invoice.findMany({ where: { invoiceNumber: 217 } });
  console.log("all #106 rows", dup106.length, dup106.map((i) => ({ id: i.id, status: i.paymentStatus })));
  console.log("all #217 rows", dup217.length, dup217.map((i) => ({ id: i.id, status: i.paymentStatus })));

  for (const n of nums) {
    const inv = await prisma.invoice.findFirst({
      where: { invoiceNumber: n },
      select: {
        invoiceNumber: true,
        paymentStatus: true,
        client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
        _count: { select: { payRunLines: true } },
      },
    });
    const conflict = inv && inv.paymentStatus !== "PAID" && inv._count.payRunLines > 0;
    console.log(`#${n}`, inv?.paymentStatus, inv?.client?.lniClaimNumber, `${inv?.client?.firstName} ${inv?.client?.lastName}`, `payLines=${inv?._count.payRunLines}`, conflict ? "CONFLICT" : "ok");
  }
  await prisma.$disconnect();
}
main();
