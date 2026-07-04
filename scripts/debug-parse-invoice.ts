/**
 * Debug Steven invoice PDF parsing for specific claims/invoices.
 * Usage: npx tsx scripts/debug-parse-invoice.ts BH00259 [--invoice=222]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { extractPdfText } from "../src/lib/pdf-text";
import {
  isStevenInvoiceFilename,
  isStevenSessionFolderName,
  parseStevenInvoiceText,
} from "../src/lib/parse-steven-invoice-pdf";

async function main() {
  const claimFilter = process.argv.find((a) => /^[A-Z]{1,2}\d+$/i.test(a))?.toUpperCase();
  const invoiceArg = process.argv.find((a) => a.startsWith("--invoice="));
  const invoiceFilter = invoiceArg ? Number(invoiceArg.split("=")[1]) : null;
  if (!claimFilter) {
    console.error("Usage: npx tsx scripts/debug-parse-invoice.ts CLAIM [--invoice=N]");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { getValidGoogleAccessToken } = await import("../src/lib/google-oauth");
  const {
    getTherapistFolderConfig,
    resolveTherapistFolderId,
    listClientFolders,
    listClientFolderFiles,
    findDriveSubfolder,
    downloadFileBuffer,
  } = await import("../src/lib/google-drive");

  const connection = await prisma.googleDriveConnection.findFirst();
  if (!connection) throw new Error("No Google Drive connection");
  const accessToken = await getValidGoogleAccessToken(connection.userId);
  const cfg = getTherapistFolderConfig().steven;
  const parentId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);

  const sources: { label: string; folders: Awaited<ReturnType<typeof listClientFolders>> }[] = [
    { label: "active", folders: await listClientFolders(accessToken, parentId) },
  ];
  const closed = await findDriveSubfolder(accessToken, parentId, cfg.closedSubfolderName ?? "CLOSED");
  if (closed) {
    sources.push({ label: "closed", folders: await listClientFolders(accessToken, closed.id) });
  }

  for (const source of sources) {
    const folders = source.folders.filter((f) => f.name.toUpperCase().startsWith(claimFilter));
    for (const folder of folders) {
      const top = await listClientFolderFiles(accessToken, folder.id);
      const sessions = top.filter(
        (f) => f.mimeType === "application/vnd.google-apps.folder" && isStevenSessionFolderName(f.name),
      );
      for (const session of sessions) {
        const files = await listClientFolderFiles(accessToken, session.id);
        for (const pdf of files.filter((f) => isStevenInvoiceFilename(f.name))) {
          const buf = await downloadFileBuffer(accessToken, pdf);
          const { text, usedOcr } = await extractPdfText(buf);
          const parsed = parseStevenInvoiceText(text);
          if (!parsed) continue;
          if (invoiceFilter != null && parsed.invoiceNumber !== invoiceFilter) continue;

          const lineTotal = parsed.lineItems.reduce((s, i) => s + i.amount, 0);
          console.log(`\n=== #${parsed.invoiceNumber} ${pdf.name} (OCR=${usedOcr}) ===`);
          console.log("TOTAL DUE:", parsed.totalDue);
          console.log("LINE TOTAL:", lineTotal.toFixed(2));
          console.log(
            "LINES:",
            parsed.lineItems.map((l) => `${l.procedureCode}=$${l.amount.toFixed(2)}`).join(", "),
          );
          console.log("\n--- RAW TEXT ---");
          console.log(text);
          console.log("--- END ---\n");
        }
      }
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
