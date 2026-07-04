/**
 * Probe Steven client folders for invoice PDFs in mm-dd-yyyy subfolders.
 * Usage: npx tsx scripts/probe-steven-invoice-pdfs.ts [claim] [--limit N]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { extractPdfText } from "../src/lib/pdf-text";

const SERVICE_DATE_FOLDER = /^\d{2}-\d{2}-\d{4}$/;

async function main() {
  const claimFilter = process.argv.find((a) => /^[A-Z]{1,2}\d+$/i.test(a))?.toUpperCase();
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 5;

  const { prisma } = await import("../src/lib/prisma");
  const { getValidGoogleAccessToken } = await import("../src/lib/google-oauth");
  const {
    getTherapistFolderConfig,
    resolveTherapistFolderId,
    listClientFolders,
    listClientFolderFiles,
    downloadFileBuffer,
  } = await import("../src/lib/google-drive");

  const connection = await prisma.googleDriveConnection.findFirst();
  if (!connection) throw new Error("No Google Drive connection");
  const accessToken = await getValidGoogleAccessToken(connection.userId);
  const cfg = getTherapistFolderConfig().steven;
  const parentId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);
  const folders = await listClientFolders(accessToken, parentId);

  const closedFolder = await (async () => {
    const { findDriveSubfolder } = await import("../src/lib/google-drive");
    return findDriveSubfolder(accessToken, parentId, cfg.closedSubfolderName ?? "CLOSED");
  })();

  const sources = [
    { label: "active", folders },
    ...(closedFolder ? [{ label: "closed", folders: await listClientFolders(accessToken, closedFolder.id) }] : []),
  ];

  let probed = 0;
  for (const source of sources) {
    const clients = claimFilter
      ? source.folders.filter((f) => f.name.toUpperCase().startsWith(claimFilter))
      : source.folders;

    for (const folder of clients.slice(0, claimFilter ? 99 : 12)) {
      const topFiles = await listClientFolderFiles(accessToken, folder.id);
      const dateFolders = topFiles.filter(
        (f) => f.mimeType === "application/vnd.google-apps.folder" && SERVICE_DATE_FOLDER.test(f.name),
      );
      console.log(`\n[${source.label}] ${folder.name}: ${dateFolders.length} date folders`);
      for (const df of dateFolders.slice(0, 3)) {
        const pdfs = await listClientFolderFiles(accessToken, df.id);
        const pdfFiles = pdfs.filter((f) => f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name));
        for (const pdf of pdfFiles) {
          if (probed >= limit) return;
          console.log(`  ${df.name}/${pdf.name}`);
          const buf = await downloadFileBuffer(accessToken, pdf);
          const { text, usedOcr } = await extractPdfText(buf);
          console.log(`    OCR=${usedOcr}, chars=${text.replace(/\s+/g, " ").trim().length}`);
          console.log(`    preview: ${text.replace(/\s+/g, " ").trim().slice(0, 400)}`);
          probed++;
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
