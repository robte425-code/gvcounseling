/**
 * Delete and re-import all PREVIEW remittance advices from Drive (refresh EOB parsing).
 *
 * Usage:
 *   npx tsx scripts/reimport-preview-remittances.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { writeFileSync } from "fs";

const RESULTS_PATH = "scripts/reimport-preview-remittances-results.json";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { listLniRemittanceAdvicePdfs } = await import("../src/lib/lni-remittance-drive");
  const { importRemittanceItemsInDateOrder, buildDriveImportItems } = await import(
    "../src/lib/remittance-import-batch"
  );

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found.");

  const previews = await prisma.remittanceAdvice.findMany({
    where: { status: "PREVIEW" },
    select: {
      id: true,
      remittanceNumber: true,
      sourceFilename: true,
      lines: {
        select: {
          claimNumber: true,
          section: true,
          eobCodes: true,
        },
      },
    },
    orderBy: { invoiceDate: "asc" },
  });

  console.log(`Deleting ${previews.length} preview remittance(s)...`);
  for (const ra of previews) {
    await prisma.remittanceAdvice.delete({ where: { id: ra.id } });
    console.log(`  deleted RA ${ra.remittanceNumber} (${ra.sourceFilename ?? "no file"})`);
  }

  const filenames = previews
    .map((ra) => ra.sourceFilename)
    .filter((name): name is string => Boolean(name));

  if (!filenames.length) {
    console.log("No source filenames on deleted previews — nothing to re-import.");
    await prisma.$disconnect();
    return;
  }

  const { accessToken } = await getSystemDriveAccessToken();
  const driveFiles = await listLniRemittanceAdvicePdfs(accessToken);
  const fileByName = new Map(driveFiles.map((file) => [file.name, file]));

  const missing: string[] = [];
  const fileIds: string[] = [];
  for (const name of filenames) {
    const file = fileByName.get(name);
    if (!file) {
      missing.push(name);
      continue;
    }
    fileIds.push(file.id);
  }

  if (missing.length) {
    console.warn(`\nWarning: ${missing.length} PDF(s) not found on Drive:`);
    for (const name of missing) console.warn(`  ${name}`);
  }

  console.log(`\nRe-importing ${fileIds.length} preview RA PDF(s)...`);
  const items = await buildDriveImportItems(accessToken, fileIds);
  const results = await importRemittanceItemsInDateOrder({
    items,
    importedById: admin.id,
  });

  const imported = results.filter((r) => r.status === "imported");
  const failed = results.filter((r) => r.status === "failed");

  const eobSummary: Array<{
    remittanceNumber: string;
    sourceFilename: string;
    deniedWithEob: number;
    eob309: number;
    eob101: number;
    bl44101_309: boolean;
  }> = [];

  for (const result of imported) {
    if (!result.remittanceAdviceId) continue;
    const ra = await prisma.remittanceAdvice.findUnique({
      where: { id: result.remittanceAdviceId },
      select: {
        remittanceNumber: true,
        sourceFilename: true,
        lines: {
          select: { claimNumber: true, section: true, eobCodes: true, serviceLines: true },
        },
      },
    });
    if (!ra) continue;

    const deniedWithEob = ra.lines.filter(
      (line) => line.section === "DENIED" && line.eobCodes.length > 0,
    ).length;
    const eob309 = ra.lines.filter((line) => line.eobCodes.includes("309")).length;
    const eob101 = ra.lines.filter((line) => line.eobCodes.includes("101")).length;
    const bl44101_309 = ra.lines.some(
      (line) =>
        line.claimNumber === "BL44101" &&
        line.section === "DENIED" &&
        line.eobCodes.includes("309"),
    );

    eobSummary.push({
      remittanceNumber: ra.remittanceNumber,
      sourceFilename: ra.sourceFilename ?? result.name,
      deniedWithEob,
      eob309,
      eob101,
      bl44101_309,
    });

    console.log(
      `  imported RA ${ra.remittanceNumber}: denied w/EOB=${deniedWithEob}, 309=${eob309}, 101=${eob101}`,
    );
  }

  const output = {
    reimportedAt: new Date().toISOString(),
    deletedPreviewCount: previews.length,
    reimportedCount: imported.length,
    failedCount: failed.length,
    missingOnDrive: missing,
    failed,
    eobSummary,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`\nDone. ${imported.length} imported, ${failed.length} failed.`);
  console.log(`Results: ${RESULTS_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
