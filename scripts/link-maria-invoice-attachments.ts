/**
 * Link Maria BILLED invoice PDFs in Google Drive to InvoiceAttachment records.
 *
 * Usage: npx tsx scripts/link-maria-invoice-attachments.ts [--dry-run] [--use-cache]
 *   [--dos-claim-fallback] [--ocr-missing]
 *
 * --use-cache: reuse invoice numbers from rescan-maria-invoice-line-items-cache.json
 * --dos-claim-fallback: match by claim + session-folder date when invoice # differs
 * --ocr-missing: download/OCR PDFs not found in cache (slow)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { existsSync, readFileSync, writeFileSync } from "fs";
import { extractPdfText } from "../src/lib/pdf-text";
import {
  isMariaInvoiceFilename,
  isMariaSessionFolderName,
  parseMariaInvoiceText,
} from "../src/lib/parse-maria-invoice-pdf";

const CACHE_PATH = "scripts/rescan-maria-invoice-line-items-cache.json";
const RESULTS_PATH = "scripts/link-maria-invoice-attachments-results.json";
const LOG_PATH = "scripts/link-maria-invoice-attachments-run.log";

type PdfEntry = {
  claim: string;
  folder: string;
  sessionFolder: string;
  filename: string;
  fileId: string;
  webViewLink: string;
  size: number;
  invoiceNumber: number | null;
};

type LinkResult = {
  invoiceNumber: number;
  claim: string;
  action: "linked" | "skipped" | "missing_pdf" | "ocr_failed";
  filename?: string;
  matchMethod?: "invoice_number" | "dos_claim_fallback";
  ocrInvoiceNumber?: number;
  error?: string;
};

function log(lines: string[], message: string) {
  lines.push(message);
  console.log(message);
}

function pdfKey(claim: string, sessionFolder: string, filename: string): string {
  return `${claim}|${sessionFolder}|${filename}`;
}

/** Parse Maria session folder names like 4-27-25 or 06-25-2026. */
function parseSessionFolderDate(name: string): Date | null {
  const m = name.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function collectInvoicePdfsWithLinks(
  accessToken: string,
  claim: string,
  folderName: string,
  clientFolderId: string,
  listClientFolderFilesWithLinks: typeof import("../src/lib/google-drive").listClientFolderFilesWithLinks,
  collected: PdfEntry[],
): Promise<void> {
  const top = await withRetry(`list ${folderName}`, () =>
    listClientFolderFilesWithLinks(accessToken, clientFolderId),
  );
  const sessionFolders = top.filter(
    (f) => f.mimeType === "application/vnd.google-apps.folder" && isMariaSessionFolderName(f.name),
  );

  for (const session of sessionFolders) {
    const files = await withRetry(`list ${session.name}`, () =>
      listClientFolderFilesWithLinks(accessToken, session.id),
    );
    const invoicePdfs = files.filter((f) => isMariaInvoiceFilename(f.name));

    for (const pdf of invoicePdfs) {
      collected.push({
        claim,
        folder: folderName,
        sessionFolder: session.name,
        filename: pdf.name,
        fileId: pdf.id,
        webViewLink: pdf.webViewLink,
        size: pdf.size,
        invoiceNumber: null,
      });
    }
  }

  const rootPdfs = top.filter((f) => isMariaInvoiceFilename(f.name));
  for (const pdf of rootPdfs) {
    collected.push({
      claim,
      folder: folderName,
      sessionFolder: "",
      filename: pdf.name,
      fileId: pdf.id,
      webViewLink: pdf.webViewLink,
      size: pdf.size,
      invoiceNumber: null,
    });
  }
}

function applyCacheInvoiceNumbers(
  pdfs: PdfEntry[],
  cacheScans: { claim: string; sessionFolder: string; filename: string; invoiceNumber: number }[],
): number {
  const byKey = new Map(
    cacheScans.map((s) => [pdfKey(s.claim, s.sessionFolder, s.filename), s.invoiceNumber]),
  );
  let applied = 0;
  for (const pdf of pdfs) {
    const num = byKey.get(pdfKey(pdf.claim, pdf.sessionFolder, pdf.filename));
    if (num != null) {
      pdf.invoiceNumber = num;
      applied++;
    }
  }
  return applied;
}

async function ocrMissingInvoiceNumbers(
  accessToken: string,
  pdfs: PdfEntry[],
  downloadFileBuffer: typeof import("../src/lib/google-drive").downloadFileBuffer,
  logLines: string[],
): Promise<number> {
  let ocrCount = 0;
  for (const pdf of pdfs) {
    if (pdf.invoiceNumber != null) continue;
    try {
      const buf = await withRetry(`download ${pdf.filename}`, () =>
        downloadFileBuffer(accessToken, { id: pdf.fileId, name: pdf.filename, mimeType: "application/pdf" }),
      );
      const { text } = await extractPdfText(buf);
      const parsed = parseMariaInvoiceText(text);
      if (parsed) {
        pdf.invoiceNumber = parsed.invoiceNumber;
        ocrCount++;
      } else {
        log(logLines, `  OCR FAIL ${pdf.claim}/${pdf.sessionFolder}/${pdf.filename}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(logLines, `  OCR ERROR ${pdf.filename}: ${message}`);
    }
  }
  return ocrCount;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const useCache = process.argv.includes("--use-cache");
  const ocrMissing = process.argv.includes("--ocr-missing");
  const dosClaimFallback = process.argv.includes("--dos-claim-fallback");
  const logLines: string[] = [];

  const { prisma } = await import("../src/lib/prisma");
  const { getValidGoogleAccessToken } = await import("../src/lib/google-oauth");
  const {
    getTherapistFolderConfig,
    resolveTherapistFolderId,
    listClientFolders,
    listClientFolderFilesWithLinks,
    findDriveSubfolder,
    downloadFileBuffer,
    parseDriveFileIdFromUrl,
  } = await import("../src/lib/google-drive");

  const connection = await prisma.googleDriveConnection.findFirst();
  if (!connection) throw new Error("No Google Drive connection");

  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  if (!maria) throw new Error("Maria therapist not found");

  const accessToken = await getValidGoogleAccessToken(connection.userId);
  const cfg = getTherapistFolderConfig().maria;
  const parentId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);

  const sources: { label: string; folders: Awaited<ReturnType<typeof listClientFolders>> }[] = [
    { label: "active", folders: await listClientFolders(accessToken, parentId) },
  ];
  const closed = await findDriveSubfolder(
    accessToken,
    parentId,
    cfg.closedSubfolderName ?? "Closed Cases",
  );
  if (closed) {
    sources.push({ label: "closed", folders: await listClientFolders(accessToken, closed.id) });
  }

  log(logLines, dryRun ? "DRY RUN" : "LIVE RUN");
  log(logLines, "Listing Drive invoice PDFs with links…");

  const pdfEntries: PdfEntry[] = [];
  for (const source of sources) {
    log(logLines, `\n${source.label}: ${source.folders.length} client folders`);
    for (const folder of source.folders) {
      const claim = folder.name.split(" - ")[0]?.trim().toUpperCase() ?? "";
      await collectInvoicePdfsWithLinks(
        accessToken,
        claim,
        folder.name,
        folder.id,
        listClientFolderFilesWithLinks,
        pdfEntries,
      );
    }
  }

  log(logLines, `Found ${pdfEntries.length} invoice PDFs in Drive`);

  if (useCache && existsSync(CACHE_PATH)) {
    const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as {
      scans: { claim: string; sessionFolder: string; filename: string; invoiceNumber: number }[];
    };
    const applied = applyCacheInvoiceNumbers(pdfEntries, cached.scans);
    log(logLines, `Applied invoice numbers from cache for ${applied}/${pdfEntries.length} PDFs`);
  }

  const withoutNumber = pdfEntries.filter((p) => p.invoiceNumber == null);
  if (withoutNumber.length) {
    if (ocrMissing) {
      log(logLines, `OCR for ${withoutNumber.length} PDFs without invoice number…`);
      const ocrCount = await ocrMissingInvoiceNumbers(
        accessToken,
        withoutNumber,
        downloadFileBuffer,
        logLines,
      );
      log(logLines, `OCR parsed invoice numbers for ${ocrCount} PDFs`);
    } else {
      log(
        logLines,
        `${withoutNumber.length} PDFs lack invoice numbers (use --ocr-missing or --use-cache)`,
      );
    }
  }

  const pdfScans = pdfEntries.filter((p) => p.invoiceNumber != null) as (PdfEntry & {
    invoiceNumber: number;
  })[];

  const byInvoiceNum = new Map<number, (typeof pdfScans)[number]>();
  for (const scan of pdfScans) {
    const existing = byInvoiceNum.get(scan.invoiceNumber);
    if (!existing) {
      byInvoiceNum.set(scan.invoiceNumber, scan);
    }
  }

  function scanForInvoice(
    invoiceNumber: number,
    claim: string,
    serviceDate?: Date | null,
  ): { scan: (typeof pdfScans)[number]; matchMethod: "invoice_number" | "dos_claim_fallback" } | undefined {
    const matches = pdfScans.filter((s) => s.invoiceNumber === invoiceNumber);
    if (matches.length) {
      const claimMatch = matches.filter((s) => s.claim === claim);
      if (claimMatch.length === 1) {
        return { scan: claimMatch[0], matchMethod: "invoice_number" };
      }
      if (claimMatch.length > 1) {
        return { scan: claimMatch[0], matchMethod: "invoice_number" };
      }
      const fallback = byInvoiceNum.get(invoiceNumber);
      if (fallback) return { scan: fallback, matchMethod: "invoice_number" };
    }

    if (!dosClaimFallback || !serviceDate) return undefined;

    const dosMatches = pdfScans.filter((s) => {
      if (s.claim !== claim) return false;
      const folderDate = parseSessionFolderDate(s.sessionFolder);
      return folderDate != null && sameCalendarDay(folderDate, serviceDate);
    });
    if (!dosMatches.length) return undefined;

    const scan = dosMatches.length === 1 ? dosMatches[0]! : dosMatches[0]!;
    return { scan, matchMethod: "dos_claim_fallback" };
  }

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: maria.id, status: "BILLED" },
    include: {
      client: { select: { lniClaimNumber: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      attachments: true,
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const results: LinkResult[] = [];
  let linked = 0;
  let skipped = 0;
  let missingPdf = 0;

  for (const invoice of invoices) {
    const serviceDate = invoice.lineItems[0]?.serviceDate ?? null;
    const match = scanForInvoice(
      invoice.invoiceNumber,
      invoice.client.lniClaimNumber,
      serviceDate,
    );
    const prefix = `#${invoice.invoiceNumber} ${invoice.client.lniClaimNumber}`;

    if (!match) {
      missingPdf++;
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "missing_pdf",
      });
      log(logLines, `${prefix} MISSING PDF`);
      continue;
    }

    const { scan, matchMethod } = match;
    const fallbackNote =
      matchMethod === "dos_claim_fallback"
        ? ` (DOS+claim fallback, OCR #${scan.invoiceNumber})`
        : "";

    const existingFileIds = new Set(
      invoice.attachments
        .map((a) => parseDriveFileIdFromUrl(a.blobUrl))
        .filter((id): id is string => Boolean(id)),
    );
    const existingFilenames = new Set(invoice.attachments.map((a) => a.filename));

    if (existingFileIds.has(scan.fileId) || existingFilenames.has(scan.filename)) {
      skipped++;
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "skipped",
        filename: scan.filename,
        matchMethod,
        ocrInvoiceNumber: scan.invoiceNumber,
      });
      continue;
    }

    if (!dryRun) {
      await prisma.invoiceAttachment.create({
        data: {
          invoiceId: invoice.id,
          filename: scan.filename,
          blobUrl: scan.webViewLink,
          contentType: "application/pdf",
          size: scan.size,
        },
      });
    }

    linked++;
    results.push({
      invoiceNumber: invoice.invoiceNumber,
      claim: invoice.client.lniClaimNumber,
      action: "linked",
      filename: scan.filename,
      matchMethod,
      ocrInvoiceNumber: scan.invoiceNumber,
    });
    log(logLines, `${prefix} LINKED${fallbackNote} → ${scan.filename}`);
  }

  const summary = {
    at: new Date().toISOString(),
    dryRun,
    useCache,
    dosClaimFallback,
    ocrMissing,
    pdfsInDrive: pdfEntries.length,
    pdfsWithInvoiceNumber: pdfScans.length,
    dbInvoices: invoices.length,
    linked,
    skipped,
    missingPdf,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  writeFileSync(LOG_PATH, logLines.join("\n"));

  log(
    logLines,
    `\nDone: ${linked} linked, ${skipped} already had attachment, ${missingPdf} missing PDF`,
  );
  log(logLines, `Results: ${RESULTS_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
