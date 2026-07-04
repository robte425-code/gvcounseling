/**
 * Debug Maria invoice PDF parsing.
 * Usage: npx tsx scripts/debug-parse-maria-invoice.ts [claim] [--limit N]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { extractPdfText } from "../src/lib/pdf-text";
import {
  isMariaInvoiceFilename,
  isMariaSessionFolderName,
  parseMariaInvoiceText,
} from "../src/lib/parse-maria-invoice-pdf";

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
    findDriveSubfolder,
    downloadFileBuffer,
  } = await import("../src/lib/google-drive");

  const connection = await prisma.googleDriveConnection.findFirst();
  if (!connection) throw new Error("No Google Drive connection");
  const accessToken = await getValidGoogleAccessToken(connection.userId);
  const cfg = getTherapistFolderConfig().maria;
  const parentId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);

  const sources: { label: string; folders: Awaited<ReturnType<typeof listClientFolders>> }[] = [
    { label: "active", folders: await listClientFolders(accessToken, parentId) },
  ];
  const closed = await findDriveSubfolder(accessToken, parentId, cfg.closedSubfolderName ?? "Closed Cases");
  if (closed) {
    sources.push({ label: "closed", folders: await listClientFolders(accessToken, closed.id) });
  }

  let count = 0;
  for (const source of sources) {
    const folders = claimFilter
      ? source.folders.filter((f) => f.name.toUpperCase().includes(claimFilter))
      : source.folders.slice(0, 20);

    for (const folder of folders) {
      const top = await listClientFolderFiles(accessToken, folder.id);
      const sessions = top.filter(
        (f) => f.mimeType === "application/vnd.google-apps.folder" && isMariaSessionFolderName(f.name),
      );
      for (const session of sessions) {
        const files = await listClientFolderFiles(accessToken, session.id);
        for (const pdf of files.filter((f) => isMariaInvoiceFilename(f.name))) {
          if (count >= limit) break;
          const buf = await downloadFileBuffer(accessToken, pdf);
          const { text, usedOcr } = await extractPdfText(buf);
          const parsed = parseMariaInvoiceText(text);
          console.log(`\n=== ${folder.name} / ${session.name} / ${pdf.name} (OCR=${usedOcr}) ===`);
          if (parsed) {
            console.log(`#${parsed.invoiceNumber} claim=${parsed.claimNumber} total=${parsed.totalDue}`);
            console.log(
              "LINES:",
              parsed.lineItems.map((l) => `${l.procedureCode}=$${l.amount.toFixed(2)}`).join(", "),
            );
          } else {
            console.log("PARSE FAILED");
            console.log("--- RAW ---");
            console.log(text);
            console.log("--- END ---");
          }
          count++;
        }
        if (count >= limit) break;
      }
      if (count >= limit) break;
    }
    if (count >= limit) break;
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
