import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return { text: result.text ?? "", pages: result.total ?? 0 };
}
import { prisma } from "../src/lib/prisma";
import { extractClaimNumber } from "../src/lib/constants";
import {
  getTherapistFolderConfig,
  listClientFolders,
  parseClientFolderName,
  resolveTherapistFolderId,
} from "../src/lib/google-drive";
import { getValidGoogleAccessToken } from "../src/lib/google-oauth";

const PDF_MIME = "application/pdf";

type DriveFile = { id: string; name: string; mimeType: string };

async function listFolderFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType)",
    pageSize: "200",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

async function downloadPdf(accessToken: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function extractFields(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const claimNumbers = [...normalized.matchAll(/\b([A-Z]{1,2}\d{5,8})\b/g)].map((m) => m[1]!);
  const npis = [...normalized.matchAll(/\b(\d{10})\b/g)].map((m) => m[1]!);
  const zips = [...normalized.matchAll(/\b(\d{5})(?:-\d{4})?\b/g)].map((m) => m[1]!);
  const dates = [...normalized.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g)].map((m) => m[1]!);
  const icd = [...normalized.matchAll(/\b([A-TV-Z]\d{2}(?:\.\d{1,4})?[A-Z0-9]*)\b/g)].map((m) => m[1]!);
  const emails = [...normalized.matchAll(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g)].map((m) => m[0]!);
  const phones = [...normalized.matchAll(/\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g)].map(
    (m) => m[0]!,
  );

  return {
    claimNumbers: [...new Set(claimNumbers)],
    npis: [...new Set(npis)],
    zips: [...new Set(zips)].slice(0, 5),
    dates: [...new Set(dates)].slice(0, 8),
    icdCodes: [...new Set(icd)].slice(0, 10),
    emails: [...new Set(emails)].slice(0, 5),
    phones: [...new Set(phones)].slice(0, 5),
    snippet: normalized.slice(0, 400),
  };
}

function classifyPdf(filename: string): string {
  const n = filename.toLowerCase();
  if (n.includes("claim") && n.includes("status")) return "claim-status";
  if (n.includes("address") || n.includes("contact")) return "addresses-contacts";
  if (n.includes("bhi") || n.includes("approval")) return "bhi-approval";
  if (n.includes("remittance")) return "remittance";
  if (n.includes("referral")) return "referral";
  if (n.includes("intake") || n.includes("initial")) return "intake";
  return "other";
}

async function main() {
  const connection = await prisma.googleDriveConnection.findFirst({
    include: { user: { select: { email: true } } },
  });
  if (!connection) {
    console.error("No Google Drive connection in database. Connect Drive in the portal first.");
    process.exit(1);
  }

  const accessToken = await getValidGoogleAccessToken(connection.userId);
  const folderConfig = getTherapistFolderConfig();
  const seenTypes = new Set<string>();
  const maxSamples = 6;
  let samples = 0;

  for (const [key, cfg] of Object.entries({
    maria: folderConfig.maria,
    steven: folderConfig.steven,
  })) {
    const parentId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);
    const clientFolders = (await listClientFolders(accessToken, parentId)).slice(0, 6);

    console.log(`\n=== ${key.toUpperCase()} (${clientFolders.length} folders sampled) ===`);

    for (const folder of clientFolders) {
      if (samples >= maxSamples) break;
      const parsed = parseClientFolderName(folder.name);
      const files = await listFolderFiles(accessToken, folder.id);
      const pdfs = files.filter(
        (f) =>
          f.mimeType === PDF_MIME ||
          f.name.toLowerCase().endsWith(".pdf") ||
          /claim|address|contact|bhi|cac|account center/i.test(f.name),
      );

      if (!pdfs.length) continue;

      console.log(`\nFolder: ${folder.name}`);
      console.log(`  PDFs: ${pdfs.map((p) => p.name).join(", ")}`);

      for (const pdfFile of pdfs) {
        if (samples >= maxSamples) break;
        const type = classifyPdf(pdfFile.name);
        const typeKey = `${type}`;
        if (seenTypes.has(typeKey)) continue;
        seenTypes.add(typeKey);

        try {
          const buffer = await downloadPdf(accessToken, pdfFile.id);
          const parsedPdf = await extractPdfText(buffer);
          const fields = extractFields(parsedPdf.text);
          console.log(`\n  [${type}] ${pdfFile.name} (${Math.round(buffer.length / 1024)} KB, ${parsedPdf.pages} pg)`);
          console.log(`  Folder claim: ${parsed?.claimNumber ?? "?"}`);
          console.log(`  Extracted claims: ${fields.claimNumbers.join(", ") || "—"}`);
          console.log(`  NPIs: ${fields.npis.join(", ") || "—"}`);
          console.log(`  ICD codes: ${fields.icdCodes.join(", ") || "—"}`);
          console.log(`  Dates: ${fields.dates.join(", ") || "—"}`);
          console.log(`  ZIPs: ${fields.zips.join(", ") || "—"}`);
          console.log(`  Emails: ${fields.emails.join(", ") || "—"}`);
          console.log(`  Phones: ${fields.phones.join(", ") || "—"}`);
          console.log(`  Snippet: ${fields.snippet.slice(0, 250)}...`);
          samples++;
        } catch (e) {
          console.log(`  [error] ${pdfFile.name}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  console.log(`\nSampled ${samples} PDF(s) total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
