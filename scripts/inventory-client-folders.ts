import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import { createRequire } from "module";
import { prisma } from "../src/lib/prisma";
import {
  getTherapistFolderConfig,
  listClientFolders,
  parseClientFolderName,
  resolveTherapistFolderId,
} from "../src/lib/google-drive";
import { getValidGoogleAccessToken } from "../src/lib/google-oauth";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

type DriveFile = { id: string; name: string; mimeType: string; size?: string };

type PdfProbe = {
  folder: string;
  therapist: string;
  claimNumber: string | null;
  filename: string;
  category: string;
  bytes: number;
  pages: number;
  textChars: number;
  textExtractable: boolean;
  preview: string;
};

type FileRecord = {
  therapist: string;
  folder: string;
  claimNumber: string | null;
  name: string;
  mimeType: string;
  category: string;
  extension: string;
};

const PDF_MIME = "application/pdf";

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "(none)" : name.slice(dot + 1).toLowerCase();
}

function classifyFilename(name: string): string {
  const n = name.toLowerCase();
  if (/referral submission/.test(n)) return "referral-submission-doc";
  if (/claim\s*&\s*account|claim and account|\bcac\b|current claim status|claim status/.test(n))
    return "claim-account-center";
  if (/address|contact/.test(n)) return "addresses-contacts";
  if (/bhi.*(approv|response|referral|request|letter)|ap response.*bhi|approval.*bhi/.test(n))
    return "bhi-approval";
  if (/consent/.test(n)) return "consent-form";
  if (/medical|provider|note|addendum|recs/.test(n)) return "medical-note";
  if (/screenshot/.test(n)) return "screenshot";
  if (/testing report|ld testing/.test(n)) return "testing-report";
  if (/^([a-z]{1,2}\d+)\.pdf$/i.test(name.trim())) return "claim-number-pdf";
  if (/\.docx?$/.test(n)) return "word-doc";
  if (/\.tif/i.test(n)) return "tiff-image";
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(n)) return "image";
  if (/\.pdf$/i.test(n)) return "pdf-other";
  return "other";
}

function isProbablyPdf(file: DriveFile): boolean {
  return (
    file.mimeType === PDF_MIME ||
    file.name.toLowerCase().endsWith(".pdf") ||
    /claim|address|contact|bhi|cac|account center|referral|medical|consent|screenshot|addendum/i.test(
      file.name,
    )
  );
}

function isTextExtractable(text: string, pages: number): boolean {
  const cleaned = text
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 80) return false;
  // Require some alphabetic content, not just numbers/punctuation
  const letters = (cleaned.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 40) return false;
  if (pages > 0 && cleaned.length / pages < 40) return false;
  return true;
}

async function listFolderFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,size)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadFile(accessToken: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function probePdf(
  accessToken: string,
  file: DriveFile,
  meta: { therapist: string; folder: string; claimNumber: string | null },
): Promise<PdfProbe> {
  const category = classifyFilename(file.name);
  try {
    const buffer = await downloadFile(accessToken, file.id);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text ?? "";
    const pages = result.total ?? result.pages?.length ?? 0;
    const textExtractable = isTextExtractable(text, pages);
    return {
      ...meta,
      filename: file.name,
      category,
      bytes: buffer.length,
      pages,
      textChars: text.replace(/\s+/g, " ").trim().length,
      textExtractable,
      preview: text.replace(/\s+/g, " ").trim().slice(0, 120),
    };
  } catch (e) {
    return {
      ...meta,
      filename: file.name,
      category,
      bytes: Number(file.size ?? 0),
      pages: 0,
      textChars: 0,
      textExtractable: false,
      preview: e instanceof Error ? e.message : "parse failed",
    };
  }
}

function summarizeCategories(records: FileRecord[]) {
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function summarizeMime(records: FileRecord[]) {
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.mimeType, (counts.get(r.mimeType) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  const connection = await prisma.googleDriveConnection.findFirst();
  if (!connection) {
    console.error("No Google Drive connection. Connect in the portal first.");
    process.exit(1);
  }

  const accessToken = await getValidGoogleAccessToken(connection.userId);
  const folderConfig = getTherapistFolderConfig();
  const allFiles: FileRecord[] = [];
  const pdfProbes: PdfProbe[] = [];

  const sources = [
    { key: "Maria", cfg: folderConfig.maria },
    { key: "Steven", cfg: folderConfig.steven },
  ] as const;

  for (const source of sources) {
    const parentId = await resolveTherapistFolderId(accessToken, source.cfg.folderId, source.cfg.folderName);
    const clientFolders = await listClientFolders(accessToken, parentId);
    console.log(`${source.key}: ${clientFolders.length} client folders`);

    for (const [i, folder] of clientFolders.entries()) {
      const parsed = parseClientFolderName(folder.name);
      const files = await listFolderFiles(accessToken, folder.id);

      for (const file of files) {
        if (file.mimeType === "application/vnd.google-apps.folder") continue;
        const category = classifyFilename(file.name);
        allFiles.push({
          therapist: source.key,
          folder: folder.name,
          claimNumber: parsed?.claimNumber ?? null,
          name: file.name,
          mimeType: file.mimeType,
          category,
          extension: extension(file.name),
        });

        if (isProbablyPdf(file) && file.mimeType !== "application/vnd.google-apps.document") {
          const probe = await probePdf(accessToken, file, {
            therapist: source.key,
            folder: folder.name,
            claimNumber: parsed?.claimNumber ?? null,
          });
          pdfProbes.push(probe);
        }
      }

      if ((i + 1) % 10 === 0) {
        console.log(`  ${source.key}: scanned ${i + 1}/${clientFolders.length} folders...`);
      }
    }
  }

  const cacProbes = pdfProbes.filter((p) => p.category === "claim-account-center");
  const cacText = cacProbes.filter((p) => p.textExtractable);
  const cacOcr = cacProbes.filter((p) => !p.textExtractable);

  const report = {
    scannedAt: new Date().toISOString(),
    totals: {
      clientFolders: new Set(allFiles.map((f) => `${f.therapist}/${f.folder}`)).size,
      files: allFiles.length,
      pdfsProbed: pdfProbes.length,
    },
    categories: summarizeCategories(allFiles),
    mimeTypes: summarizeMime(allFiles),
    pdfExtractability: {
      textExtractable: pdfProbes.filter((p) => p.textExtractable).length,
      needsOcr: pdfProbes.filter((p) => !p.textExtractable).length,
      byCategory: Object.fromEntries(
        [...new Set(pdfProbes.map((p) => p.category))].map((cat) => {
          const items = pdfProbes.filter((p) => p.category === cat);
          return [
            cat,
            {
              total: items.length,
              textExtractable: items.filter((p) => p.textExtractable).length,
              needsOcr: items.filter((p) => !p.textExtractable).length,
            },
          ];
        }),
      ),
    },
    claimAccountCenter: {
      total: cacProbes.length,
      textExtractable: cacText.length,
      needsOcr: cacOcr.length,
      ocrExamples: cacOcr.slice(0, 15).map((p) => ({
        therapist: p.therapist,
        folder: p.folder,
        filename: p.filename,
        pages: p.pages,
        textChars: p.textChars,
        preview: p.preview,
      })),
      textExamples: cacText.slice(0, 5).map((p) => ({
        therapist: p.therapist,
        folder: p.folder,
        filename: p.filename,
        preview: p.preview,
      })),
    },
    uniqueFilenamesByCategory: Object.fromEntries(
      [...new Set(allFiles.map((f) => f.category))].map((cat) => [
        cat,
        [...new Set(allFiles.filter((f) => f.category === cat).map((f) => f.name))]
          .sort()
          .slice(0, 30),
      ]),
    ),
  };

  const outPath = "scripts/client-folder-inventory.json";
  writeFileSync(outPath, JSON.stringify({ report, pdfProbes, allFiles }, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
