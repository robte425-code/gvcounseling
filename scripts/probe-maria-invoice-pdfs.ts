/**
 * Probe Maria client folders for invoice PDFs and session folder naming.
 * Usage: npx tsx scripts/probe-maria-invoice-pdfs.ts [claim] [--limit N]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { extractPdfText } from "../src/lib/pdf-text";

const SESSION_FOLDER_PATTERNS = [
  { name: "m-d-yy", re: /^\d{1,2}-\d{1,2}-\d{2}$/ },
  { name: "m-d-yyyy", re: /^\d{1,2}-\d{1,2}-\d{4}$/ },
  { name: "mm-dd-yyyy", re: /^\d{2}-\d{2}-\d{4}$/ },
  { name: "yyyy-mm-dd", re: /^\d{4}-\d{2}-\d{2}$/ },
];

function classifySessionFolder(name: string): string | null {
  for (const p of SESSION_FOLDER_PATTERNS) {
    if (p.re.test(name.trim())) return p.name;
  }
  return null;
}

function isInvoicePdf(name: string): boolean {
  return /invoice/i.test(name) && /\.pdf$/i.test(name);
}

async function main() {
  const claimFilter = process.argv.find((a) => /^[A-Z]{1,2}\d+$/i.test(a))?.toUpperCase();
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 8;

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
  const cfg = getTherapistFolderConfig().maria;
  const parentId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);
  const folders = await listClientFolders(accessToken, parentId);

  const closedFolder = await findDriveSubfolder(
    accessToken,
    parentId,
    cfg.closedSubfolderName ?? "Closed Cases",
  );

  const sources = [
    { label: "active", folders },
    ...(closedFolder
      ? [{ label: "closed", folders: await listClientFolders(accessToken, closedFolder.id) }]
      : []),
  ];

  const folderPatternCounts: Record<string, number> = {};
  let probed = 0;

  for (const source of sources) {
    const clients = claimFilter
      ? source.folders.filter((f) => f.name.toUpperCase().startsWith(claimFilter))
      : source.folders;

    for (const folder of clients.slice(0, claimFilter ? 99 : 15)) {
      const topFiles = await listClientFolderFiles(accessToken, folder.id);
      const sessionFolders = topFiles.filter(
        (f) => f.mimeType === "application/vnd.google-apps.folder" && classifySessionFolder(f.name),
      );

      for (const sf of sessionFolders) {
        const kind = classifySessionFolder(sf.name)!;
        folderPatternCounts[kind] = (folderPatternCounts[kind] ?? 0) + 1;
      }

      console.log(
        `\n[${source.label}] ${folder.name}: ${sessionFolders.length} session folders`,
      );
      if (sessionFolders.length) {
        console.log(
          `  samples: ${sessionFolders
            .slice(0, 5)
            .map((f) => `${f.name}(${classifySessionFolder(f.name)})`)
            .join(", ")}`,
        );
      }

      for (const df of sessionFolders.slice(0, 4)) {
        const pdfs = await listClientFolderFiles(accessToken, df.id);
        const invoicePdfs = pdfs.filter((f) => isInvoicePdf(f.name));
        const allPdfs = pdfs.filter((f) => f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name));

        if (allPdfs.length && !invoicePdfs.length) {
          console.log(`  ${df.name}: PDFs (no "invoice" in name): ${allPdfs.map((p) => p.name).join(", ")}`);
        }

        for (const pdf of invoicePdfs.length ? invoicePdfs : allPdfs.slice(0, 1)) {
          if (probed >= limit) {
            await prisma.$disconnect();
            console.log("\nFolder pattern counts:", folderPatternCounts);
            return;
          }
          console.log(`  ${df.name}/${pdf.name}`);
          const buf = await downloadFileBuffer(accessToken, pdf);
          const { text, usedOcr } = await extractPdfText(buf);
          console.log(`    OCR=${usedOcr}, chars=${text.replace(/\s+/g, " ").trim().length}`);
          console.log(`    preview: ${text.replace(/\s+/g, " ").trim().slice(0, 500)}`);
          probed++;
        }
      }
    }
  }

  console.log("\nFolder pattern counts:", folderPatternCounts);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
