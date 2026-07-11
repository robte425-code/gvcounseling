import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function main() {
  const previews = await prisma.remittanceAdvice.findMany({
    where: { status: "PREVIEW" },
    select: {
      remittanceNumber: true,
      lines: {
        where: { matchedInvoiceId: null, supersededAt: null },
        select: { claimNumber: true, section: true, serviceLines: true },
      },
    },
  });
  console.log("PREVIEW RAs:", previews.length);
  for (const p of previews) {
    console.log(p.remittanceNumber, "unmatched", p.lines.length, p.lines.slice(0, 3));
  }
  await prisma.$disconnect();
}
main();
