/**
 * Count Maria therapist fee gaps on PREVIEW remittance advices.
 * Usage: npx tsx scripts/verify-maria-fee-gaps.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { prisma } from "../src/lib/prisma";
import { computeTherapistAmountForInvoice } from "../src/lib/remittance-advice";

async function main() {
  const maria = await prisma.user.findFirst({
    where: { email: "maria@gvcounseling.com" },
    select: { id: true },
  });
  if (!maria) throw new Error("Maria not found");

  const previewRAs = await prisma.remittanceAdvice.findMany({
    where: { status: "PREVIEW" },
    include: { lines: true },
    orderBy: { invoiceDate: "asc" },
  });

  const gaps: Record<string, number> = {};
  let totalGaps = 0;

  for (const ra of previewRAs) {
    const paidLines = ra.lines.filter((b) => b.section === "PAID" && b.matchedInvoiceId);
    for (const line of paidLines) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: line.matchedInvoiceId! },
        include: {
          lineItems: { select: { procedureCode: true, serviceDate: true, units: true } },
        },
      });
      if (!invoice || invoice.therapistId !== maria.id) continue;

      const fees = await prisma.therapistProcedureCodeFee.findMany({
        where: { therapistId: maria.id },
      });

      try {
        await computeTherapistAmountForInvoice(invoice, fees);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const match = msg.match(/Missing therapist fee for (\S+)/);
        const code = match?.[1] ?? "unknown";
        gaps[code] = (gaps[code] ?? 0) + 1;
        totalGaps++;
      }
    }
  }

  console.log("Maria fee gaps on PREVIEW RAs:");
  console.log("Total gap instances:", totalGaps);
  for (const [code, count] of Object.entries(gaps).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code}: ${count}`);
  }

  const existing = await prisma.therapistProcedureCodeFee.findMany({
    where: { therapistId: maria.id },
    orderBy: [{ procedureCode: "asc" }, { effectiveFrom: "asc" }],
  });
  console.log(`\nMaria fee rows (${existing.length}):`);
  for (const row of existing) {
    console.log(
      " ",
      row.procedureCode,
      Number(row.amount).toFixed(2),
      row.effectiveFrom.toISOString().slice(0, 10),
      "->",
      row.effectiveTo?.toISOString().slice(0, 10) ?? "current",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
