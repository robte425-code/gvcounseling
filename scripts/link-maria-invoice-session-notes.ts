/**
 * Link Maria session clinical documents (SOAP, PHQ-4, GCPS, BHI forms) from the same
 * Drive session folder as each BILLED invoice PDF.
 *
 * Usage: npx tsx scripts/link-maria-invoice-session-notes.ts [--dry-run] [--use-cache]
 *   [--dos-claim-fallback] [--ocr-missing]
 *
 * --use-cache: reuse invoice numbers from rescan-maria-invoice-line-items-cache.json
 * --dos-claim-fallback: match by claim + session-folder date when invoice # differs
 * --ocr-missing: parse invoice PDFs in folders not found in cache (slow)
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
const RESULTS_PATH = "scripts/link-maria-invoice-session-notes-results.json";
const LOG_PATH = "scripts/link-maria-invoice-session-notes-run.log";

type SessionDoc = {
  filename: string;
  fileId: string;
  webViewLink: string;
  contentType: string;
  size: number;
};

type SessionFolderEntry = {
  claim: string;
  folder: string;
  sessionFolder: string;
  invoiceFilenames: string[];
  invoiceNumber: number | null;
  sessionDocs: SessionDoc[];
};

type InvoiceLinkResult = {
  invoiceNumber: number;
  claim: string;
  action: "linked" | "skipped_all" | "missing_folder" | "no_session_docs";
  matchMethod?: "invoice_number" | "dos_claim_fallback";
  sessionFolder?: string;
  linkedDocs?: string[];
  skippedDocs?: string[];
  notesLinked?: number;
  error?: string;
};

function log(lines: string[], message: string) {
  lines.push(message);
  console.log(message);
}

function folderKey(claim: string, sessionFolder: string): string {
  return `${claim}|${sessionFolder}`;
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

/** Clinically relevant session documents in Maria session folders. */
export function isMariaSessionDocument(filename: string, mimeType?: string): boolean {
  if (isMariaInvoiceFilename(filename)) return false;
  if (mimeType === "application/vnd.google-apps.folder") return false;

  const n = filename.toLowerCase();

  if (/claim\s*&\s*account|claim status|address|contact|\bcac\b|referral|consent|fax/i.test(n)) {
    return false;
  }
  if (
    /bhi.*(approv|response|referral|request|letter|questionnaire|authorization)|ap response.*bhi|approval.*bhi/i.test(
      n,
    )
  ) {
    return false;
  }
  if (/\bbhi\b/i.test(n) && !/cac|claim status|address|contact|account center|soap|assessment|form|note|intervention/i.test(n)) {
    return false;
  }
  if (/medical note|provider note|addendum|ld testing|testing report/i.test(n)) return false;

  if (/\bsoap\b/i.test(n)) return true;
  if (/phq[- ]?4/i.test(n)) return true;
  if (/gcps/i.test(n)) return true;
  if (/session\s*note/i.test(n)) return true;
  if (/behavioral health (assessment|intervention)/i.test(n)) return true;
  if (/\bbhi\b/i.test(n) && /(assessment|form|note|soap|intervention)/i.test(n)) return true;

  return false;
}

function contentTypeForFile(filename: string, mimeType: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  if (/\.pdf$/i.test(filename)) return "application/pdf";
  if (/\.docx$/i.test(filename)) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (/\.doc$/i.test(filename)) return "application/msword";
  return mimeType || "application/octet-stream";
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

async function collectSessionFolders(
  accessToken: string,
  claim: string,
  folderName: string,
  clientFolderId: string,
  listClientFolderFilesWithLinks: typeof import("../src/lib/google-drive").listClientFolderFilesWithLinks,
  collected: SessionFolderEntry[],
  folderIdByName: Map<string, string>,
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
    const sessionDocs = files
      .filter((f) => isMariaSessionDocument(f.name, f.mimeType))
      .map((f) => ({
        filename: f.name,
        fileId: f.id,
        webViewLink: f.webViewLink,
        contentType: contentTypeForFile(f.name, f.mimeType),
        size: f.size,
      }));

    collected.push({
      claim,
      folder: folderName,
      sessionFolder: session.name,
      invoiceFilenames: invoicePdfs.map((f) => f.name),
      invoiceNumber: null,
      sessionDocs,
    });
    folderIdByName.set(folderKey(claim, session.name), session.id);
  }
}

async function ocrMissingInvoiceNumbers(
  accessToken: string,
  folders: SessionFolderEntry[],
  listClientFolderFilesWithLinks: typeof import("../src/lib/google-drive").listClientFolderFilesWithLinks,
  downloadFileBuffer: typeof import("../src/lib/google-drive").downloadFileBuffer,
  folderIdByName: Map<string, string>,
  logLines: string[],
): Promise<number> {
  let ocrCount = 0;
  for (const entry of folders) {
    if (entry.invoiceNumber != null || !entry.invoiceFilenames.length) continue;
    const folderId = folderIdByName.get(folderKey(entry.claim, entry.sessionFolder));
    if (!folderId) continue;

    const files = await withRetry(`list ${entry.sessionFolder}`, () =>
      listClientFolderFilesWithLinks(accessToken, folderId),
    );
    for (const filename of entry.invoiceFilenames) {
      const pdf = files.find((f) => f.name === filename);
      if (!pdf) continue;
      try {
        const buf = await withRetry(`download ${filename}`, () =>
          downloadFileBuffer(accessToken, pdf),
        );
        const { text } = await extractPdfText(buf);
        const parsed = parseMariaInvoiceText(text);
        if (parsed) {
          entry.invoiceNumber = parsed.invoiceNumber;
          ocrCount++;
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(logLines, `  OCR ERROR ${entry.claim}/${entry.sessionFolder}/${filename}: ${message}`);
      }
    }
  }
  return ocrCount;
}

function applyCacheInvoiceNumbers(
  folders: SessionFolderEntry[],
  cacheScans: { claim: string; sessionFolder: string; filename: string; invoiceNumber: number }[],
): number {
  const byKey = new Map(
    cacheScans.map((s) => [pdfKey(s.claim, s.sessionFolder, s.filename), s.invoiceNumber]),
  );
  let applied = 0;
  for (const entry of folders) {
    for (const filename of entry.invoiceFilenames) {
      const num = byKey.get(pdfKey(entry.claim, entry.sessionFolder, filename));
      if (num != null) {
        entry.invoiceNumber = num;
        applied++;
        break;
      }
    }
  }
  return applied;
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
  log(logLines, "Listing Drive session folders…");

  const folderEntries: SessionFolderEntry[] = [];
  const folderIdByName = new Map<string, string>();
  for (const source of sources) {
    log(logLines, `\n${source.label}: ${source.folders.length} client folders`);
    for (const folder of source.folders) {
      const claim = folder.name.split(" - ")[0]?.trim().toUpperCase() ?? "";
      await collectSessionFolders(
        accessToken,
        claim,
        folder.name,
        folder.id,
        listClientFolderFilesWithLinks,
        folderEntries,
        folderIdByName,
      );
    }
  }

  const totalSessionDocs = folderEntries.reduce((sum, e) => sum + e.sessionDocs.length, 0);
  log(
    logLines,
    `Found ${folderEntries.length} session folders with ${totalSessionDocs} clinical session documents`,
  );

  if (useCache && existsSync(CACHE_PATH)) {
    const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as {
      scans: { claim: string; sessionFolder: string; filename: string; invoiceNumber: number }[];
    };
    const applied = applyCacheInvoiceNumbers(folderEntries, cached.scans);
    log(logLines, `Applied invoice numbers from cache for ${applied} session folders`);
  }

  const withoutNumber = folderEntries.filter((e) => e.invoiceNumber == null && e.invoiceFilenames.length);
  if (withoutNumber.length) {
    if (ocrMissing) {
      log(logLines, `OCR for ${withoutNumber.length} session folders without invoice number…`);
      const ocrCount = await ocrMissingInvoiceNumbers(
        accessToken,
        withoutNumber,
        listClientFolderFilesWithLinks,
        downloadFileBuffer,
        folderIdByName,
        logLines,
      );
      log(logLines, `OCR parsed invoice numbers for ${ocrCount} session folders`);
    } else {
      log(
        logLines,
        `${withoutNumber.length} session folders lack invoice numbers (use --ocr-missing or --use-cache)`,
      );
    }
  }

  type FolderWithInvoice = SessionFolderEntry & { invoiceNumber: number };
  const foldersWithInvoice = folderEntries.filter(
    (e): e is FolderWithInvoice => e.invoiceNumber != null,
  );

  const byInvoiceNum = new Map<number, FolderWithInvoice>();
  for (const entry of foldersWithInvoice) {
    const existing = byInvoiceNum.get(entry.invoiceNumber);
    if (!existing) {
      byInvoiceNum.set(entry.invoiceNumber, entry);
    }
  }

  function folderForInvoice(
    invoiceNumber: number,
    claim: string,
    serviceDate?: Date | null,
  ):
    | { entry: SessionFolderEntry; matchMethod: "invoice_number" | "dos_claim_fallback" }
    | undefined {
    const matches = foldersWithInvoice.filter((e) => e.invoiceNumber === invoiceNumber);
    if (matches.length) {
      const claimMatch = matches.filter((e) => e.claim === claim);
      if (claimMatch.length >= 1) {
        return { entry: claimMatch[0]!, matchMethod: "invoice_number" };
      }
      const fallback = byInvoiceNum.get(invoiceNumber);
      if (fallback) return { entry: fallback, matchMethod: "invoice_number" };
    }

    if (!dosClaimFallback || !serviceDate) return undefined;

    const dosMatches = foldersWithInvoice.filter((e) => {
      if (e.claim !== claim) return false;
      const folderDate = parseSessionFolderDate(e.sessionFolder);
      return folderDate != null && sameCalendarDay(folderDate, serviceDate);
    });
    if (!dosMatches.length) return undefined;

    return { entry: dosMatches[0]!, matchMethod: "dos_claim_fallback" };
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

  const results: InvoiceLinkResult[] = [];
  let invoicesLinked = 0;
  let totalDocsLinked = 0;
  let totalDocsSkipped = 0;
  let missingFolder = 0;
  let noSessionDocs = 0;

  for (const invoice of invoices) {
    const serviceDate = invoice.lineItems[0]?.serviceDate ?? null;
    const match = folderForInvoice(
      invoice.invoiceNumber,
      invoice.client.lniClaimNumber,
      serviceDate,
    );
    const prefix = `#${invoice.invoiceNumber} ${invoice.client.lniClaimNumber}`;

    if (!match) {
      missingFolder++;
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "missing_folder",
      });
      log(logLines, `${prefix} MISSING FOLDER`);
      continue;
    }

    const { entry, matchMethod } = match;
    const sessionDocs = entry.sessionDocs;

    if (!sessionDocs.length) {
      noSessionDocs++;
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "no_session_docs",
        matchMethod,
        sessionFolder: entry.sessionFolder,
      });
      log(logLines, `${prefix} NO SESSION DOCS (${entry.sessionFolder})`);
      continue;
    }

    const existingFileIds = new Set(
      invoice.attachments
        .map((a) => parseDriveFileIdFromUrl(a.blobUrl))
        .filter((id): id is string => Boolean(id)),
    );
    const existingFilenames = new Set(invoice.attachments.map((a) => a.filename));
    const existingBlobUrls = new Set(invoice.attachments.map((a) => a.blobUrl));

    const linkedDocs: string[] = [];
    const skippedDocs: string[] = [];
    let linkedThisInvoice = 0;

    for (const doc of sessionDocs) {
      if (
        existingFileIds.has(doc.fileId) ||
        existingFilenames.has(doc.filename) ||
        existingBlobUrls.has(doc.webViewLink)
      ) {
        skippedDocs.push(doc.filename);
        totalDocsSkipped++;
        continue;
      }

      if (!dryRun) {
        await prisma.invoiceAttachment.create({
          data: {
            invoiceId: invoice.id,
            filename: doc.filename,
            blobUrl: doc.webViewLink,
            contentType: doc.contentType,
            size: doc.size,
          },
        });
      }

      linkedDocs.push(doc.filename);
      linkedThisInvoice++;
      totalDocsLinked++;
      existingFileIds.add(doc.fileId);
      existingFilenames.add(doc.filename);
      existingBlobUrls.add(doc.webViewLink);
    }

    if (linkedThisInvoice > 0) {
      invoicesLinked++;
      const fallbackNote =
        matchMethod === "dos_claim_fallback" ? ` (DOS+claim fallback, OCR #${entry.invoiceNumber})` : "";
      log(
        logLines,
        `${prefix} LINKED ${linkedThisInvoice} doc(s)${fallbackNote} → ${linkedDocs.join(", ")}`,
      );
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "linked",
        matchMethod,
        sessionFolder: entry.sessionFolder,
        linkedDocs,
        skippedDocs,
        notesLinked: linkedThisInvoice,
      });
    } else {
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "skipped_all",
        matchMethod,
        sessionFolder: entry.sessionFolder,
        skippedDocs,
        notesLinked: 0,
      });
      log(
        logLines,
        `${prefix} SKIPPED (all ${sessionDocs.length} doc(s) already linked) → ${skippedDocs.join(", ")}`,
      );
    }
  }

  const notesPerInvoice = results
    .filter((r) => r.notesLinked != null && r.notesLinked > 0)
    .map((r) => ({
      invoiceNumber: r.invoiceNumber,
      claim: r.claim,
      notesLinked: r.notesLinked!,
      docs: r.linkedDocs ?? [],
    }));

  const summary = {
    at: new Date().toISOString(),
    dryRun,
    useCache,
    ocrMissing,
    dosClaimFallback,
    sessionFoldersInDrive: folderEntries.length,
    sessionDocsInDrive: totalSessionDocs,
    foldersWithInvoiceNumber: foldersWithInvoice.length,
    dbInvoices: invoices.length,
    invoicesWithNotesLinked: invoicesLinked,
    totalDocsLinked,
    totalDocsSkipped,
    missingFolder,
    noSessionDocs,
    notesPerInvoice,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  writeFileSync(LOG_PATH, logLines.join("\n"));

  log(
    logLines,
    `\nDone: ${totalDocsLinked} session docs linked across ${invoicesLinked} invoices`,
  );
  log(
    logLines,
    `${totalDocsSkipped} already linked, ${missingFolder} missing folder, ${noSessionDocs} folder with no session docs`,
  );
  log(logLines, `Results: ${RESULTS_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
