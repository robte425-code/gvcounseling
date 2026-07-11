import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { applyRemittanceAdvice } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

async function main() {
  const remittanceNumber = process.argv[2] ?? "803580";
  const ra = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber },
    include: { lines: true },
  });
  if (!ra) throw new Error(`RA ${remittanceNumber} not found`);
  console.log("status", ra.status, "lines", ra.lines.length);

  const unmatched = ra.lines.filter((l) => !l.matchedInvoiceId && !l.supersededAt);
  for (const line of unmatched) {
    await prisma.remittanceAdviceLine.update({
      where: { id: line.id },
      data: {
        supersededAt: new Date(),
        supersedeNote: "Unmatched data gap during psychotherapy RA reimport",
      },
    });
    console.log("superseded", line.claimNumber, line.section);
  }

  if (ra.status === "PREVIEW") {
    await applyRemittanceAdvice(ra.id);
    console.log("applied", remittanceNumber);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
