import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";
import { calendarIsoFromDate } from "../src/lib/constants";

const pairs = [
  [853, 992],
  [851, 869],
  [897, 475],
  [906, 475],
  [805, 754],
  [840, 953],
];

async function main() {
  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  for (const [a, b] of pairs) {
    const invs = await prisma.invoice.findMany({
      where: { invoiceNumber: { in: [a, b] }, therapistId: maria!.id },
      include: {
        client: { select: { lniClaimNumber: true } },
        lineItems: { select: { procedureCode: true, serviceDate: true } },
      },
    });
    console.log(`\nCompare #${a} vs #${b}:`);
    for (const inv of invs.sort((x, y) => x.invoiceNumber - y.invoiceNumber)) {
      console.log(
        `  #${inv.invoiceNumber} ${inv.client.lniClaimNumber} ${inv.paymentStatus}`,
        inv.lineItems.map((l) => `${calendarIsoFromDate(l.serviceDate)} ${l.procedureCode}`),
      );
    }
  }
  await prisma.$disconnect();
}
main();
