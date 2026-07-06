/**
 * Delete all PREVIEW remittances and re-import every RA PDF from Drive in date order.
 * Usage: npx tsx scripts/reingest-all-remittances.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import { getSystemDriveAccessToken } from "../src/lib/google-drive-system";
import { listLniRemittanceAdvicePdfs } from "../src/lib/lni-remittance-drive";
import { importRemittancesFromDriveAndUploads } from "../src/lib/remittance-import-batch";
import { revertAppliedRemittance } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

const RESULTS_PATH = "scripts/reingest-all-remittances-results.json";

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found.");

  const appliedRemittances = await prisma.remittanceAdvice.findMany({
    where: { status: "APPLIED" },
    select: { id: true, remittanceNumber: true, sourceFilename: true },
    orderBy: { invoiceDate: "asc" },
  });

  if (appliedRemittances.length) {
    console.log(`Reverting ${appliedRemittances.length} applied remittance(s)...`);
    for (const ra of appliedRemittances) {
      await revertAppliedRemittance(ra.id);
      console.log("  reverted", ra.remittanceNumber, ra.sourceFilename ?? "");
    }
  }

  const previewRemittances = await prisma.remittanceAdvice.findMany({
    where: { status: "PREVIEW" },
    select: { id: true, remittanceNumber: true, sourceFilename: true },
    orderBy: { invoiceDate: "asc" },
  });

  console.log(`Deleting ${previewRemittances.length} preview remittance(s)...`);
  for (const ra of previewRemittances) {
    await prisma.remittanceAdvice.delete({ where: { id: ra.id } });
    console.log("  deleted", ra.remittanceNumber, ra.sourceFilename ?? "");
  }

  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listLniRemittanceAdvicePdfs(accessToken);
  console.log(`Importing ${files.length} RA PDF(s) from Drive...`);

  const results = await importRemittancesFromDriveAndUploads({
    driveFileIds: files.map((file) => file.id),
    files: [],
    importedById: admin.id,
  });

  const imported = results.filter((result) => result.status === "imported");
  const failed = results.filter((result) => result.status === "failed");

  let unmatchedLines = 0;
  let invoicesWithEob = 0;
  const previews = await prisma.remittanceAdvice.findMany({
    where: { status: "PREVIEW" },
    include: { lines: true },
    orderBy: { invoiceDate: "asc" },
  });

  for (const ra of previews) {
    const unmatched = ra.lines.filter((line) => !line.matchedInvoiceId);
    unmatchedLines += unmatched.length;
    if (unmatched.length) {
      console.log("unmatched", ra.remittanceNumber, ra.sourceFilename, unmatched.length);
    }
  }

  invoicesWithEob = await prisma.invoice.count({
    where: { lniEobCodes: { isEmpty: false } },
  });

  const summary = {
    revertedApplied: appliedRemittances.length,
    deletedPreviews: previewRemittances.length,
    driveFiles: files.length,
    imported: imported.length,
    failed,
    previewCount: previews.length,
    unmatchedLines,
    invoicesWithEob,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Results: ${RESULTS_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
