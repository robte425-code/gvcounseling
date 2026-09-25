/**
 * Re-import a remittance that is still a preview, so it is parsed and matched by
 * the current code.
 *
 * A preview imported before a parser fix keeps whatever the old code made of it.
 * The Sep 15 PDF, for instance, was stored as 8 bills with all 8 unmatched,
 * because the claim number field held the control number L&I echoes back; the
 * same file now reads as 12 bills with none unmatched, and carries L&I's own
 * reason codes.
 *
 * Only previews are touched. An applied remittance has already moved money and is
 * refused outright — reverting one is a different operation with different risks.
 * Nothing is applied here either: this refreshes what the preview says, and
 * applying it stays a separate, deliberate step.
 *
 *   npx tsx scripts/refresh-remittance-preview.ts --remittance 108125 --dry-run
 *   npx tsx scripts/refresh-remittance-preview.ts --remittance 108125
 */
import dotenv from "dotenv";

// .env.local first: .env carries placeholder credentials.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { listLniRemittanceAdvicePdfs, downloadLniRemittancePdf } = await import("../src/lib/lni-remittance-drive");
  const { parseLniRemittancePdf } = await import("../src/lib/parse-lni-remittance-pdf");
  const { matchRemittanceBills } = await import("../src/lib/match-remittance-to-invoices");
  const { deleteRemittancePreview, importRemittancePreview } = await import("../src/lib/remittance-advice");
  const prisma = createPrismaClient();

  const remittanceNumber = arg("remittance");
  const dryRun = process.argv.includes("--dry-run");
  if (!remittanceNumber) {
    console.log("Usage: --remittance <number> [--dry-run]");
    await prisma.$disconnect();
    return;
  }

  const existing = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber, sourceFormat: "PDF_RA" },
    select: {
      id: true, remittanceNumber: true, warrantRegister: true, status: true, invoiceDate: true,
      sourceFilename: true, importedById: true,
      lines: { select: { matchedInvoiceId: true, section: true, eobCodes: true } },
    },
  });
  if (!existing) {
    console.log(`No PDF remittance ${remittanceNumber}.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`RA ${existing.remittanceNumber} (warrant ${existing.warrantRegister}) ${existing.invoiceDate.toISOString().slice(0, 10)}`);
  console.log(`  status=${existing.status}  file=${existing.sourceFilename ?? "unknown"}`);
  const before = {
    lines: existing.lines.length,
    unmatched: existing.lines.filter((l) => !l.matchedInvoiceId).length,
    codes: existing.lines.reduce((n, l) => n + l.eobCodes.length, 0),
  };
  console.log(`  before: ${before.lines} bills, ${before.unmatched} unmatched, ${before.codes} EOB codes`);

  if (existing.status !== "PREVIEW") {
    console.log("refusing: that remittance is applied — only previews can be refreshed.");
    await prisma.$disconnect();
    return;
  }
  if (!existing.sourceFilename) {
    console.log("refusing: no source filename recorded, so the original cannot be fetched.");
    await prisma.$disconnect();
    return;
  }

  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listLniRemittanceAdvicePdfs(accessToken);
  const file = files.find((f) => f.name === existing.sourceFilename);
  if (!file) {
    console.log(`refusing: ${existing.sourceFilename} is not in the LNI RAs folder.`);
    await prisma.$disconnect();
    return;
  }

  const parsed = await parseLniRemittancePdf(await downloadLniRemittancePdf(accessToken, file));
  const matches = await matchRemittanceBills(parsed.bills);
  const after = {
    lines: parsed.bills.length,
    unmatched: matches.filter((m) => !m.matchedInvoiceId).length,
    codes: parsed.bills.reduce((n, b) => n + b.eobCodes.length, 0),
    extra: matches.reduce((n, m) => n + m.additionalMatches.length, 0),
  };
  console.log(`  after:  ${after.lines} bills, ${after.unmatched} unmatched, ${after.codes} EOB codes${after.extra ? `, ${after.extra} extra invoice(s) from bundled bills` : ""}`);

  const sections: Record<string, number> = {};
  for (const b of parsed.bills) sections[b.section] = (sections[b.section] ?? 0) + 1;
  console.log(`  sections: ${JSON.stringify(sections)}`);
  console.log(`  total: $${Number(parsed.totalPaid).toFixed(2)}`);

  if (dryRun) {
    console.log("\nDry run — the stored preview is unchanged.");
    await prisma.$disconnect();
    return;
  }

  await deleteRemittancePreview(existing.id);
  const { remittanceAdviceId } = await importRemittancePreview({
    parsed,
    matches,
    sourceFilename: existing.sourceFilename,
    importedById: existing.importedById,
    sourceFormat: "PDF_RA",
  });

  const fresh = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    select: { status: true, lines: { select: { matchedInvoiceId: true, eobCodes: true } } },
  });
  console.log(`\nRefreshed: ${fresh!.lines.length} bills, ${fresh!.lines.filter((l) => !l.matchedInvoiceId).length} unmatched, status ${fresh!.status}.`);
  console.log("Not applied — applying stays a separate step.");

  await prisma.$disconnect();
}

main();
