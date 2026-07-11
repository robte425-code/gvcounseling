/**
 * Test remittance import flow end-to-end (parse, match, preview).
 * Usage: npx tsx scripts/test-remittance-import.ts <pdf>
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import fs from "fs";
import path from "path";
import { parseLniRemittancePdf } from "../src/lib/parse-lni-remittance-pdf";
import { matchRemittanceBills } from "../src/lib/match-remittance-to-invoices";
import { buildTherapistPayPreview } from "../src/lib/remittance-advice";

async function main() {
  const pdf = process.argv[2];
  if (!pdf) {
    console.error("Usage: npx tsx scripts/test-remittance-import.ts <pdf>");
    process.exit(1);
  }

  const buf = fs.readFileSync(pdf);
  console.log("1. Parsing PDF...");
  const parsed = await parseLniRemittancePdf(buf);
  console.log(`   RA ${parsed.remittanceNumber}, warrant ${parsed.warrantRegister}, ${parsed.bills.length} bills`);

  console.log("2. Matching bills to invoices...");
  const matches = await matchRemittanceBills(parsed.bills);
  const matched = matches.filter((m) => m.matchedInvoiceId);
  console.log(`   ${matched.length}/${matches.length} matched`);

  console.log("3. Building therapist pay preview...");
  try {
    const preview = await buildTherapistPayPreview(matches);
    console.log(`   ${preview.length} therapist(s), total $${preview.reduce((s, p) => s + p.therapistAmount, 0).toFixed(2)}`);
  } catch (e) {
    console.error("   FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.log("4. Checking RemittanceAdvice table exists...");
  const { prisma } = await import("../src/lib/prisma");
  try {
    const count = await prisma.remittanceAdvice.count();
    console.log(`   OK — ${count} existing remittance(s)`);
  } catch (e) {
    console.error("   FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (process.argv.includes("--create")) {
    console.log("5. Creating preview record (dry-run import)...");
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true, email: true },
    });
    if (!admin) throw new Error("No admin user found.");
    const { importRemittancePreview } = await import("../src/lib/remittance-advice");
    const { remittanceAdviceId } = await importRemittancePreview({
      parsed,
      matches,
      sourceFilename: path.basename(pdf),
      importedById: admin.id,
    });
    console.log(`   Created ${remittanceAdviceId}`);
    await prisma.remittanceAdvice.delete({ where: { id: remittanceAdviceId } });
    console.log("   Cleaned up test record.");
  }

  await prisma.$disconnect();
  console.log("\nAll checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
