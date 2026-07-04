/**
 * Rescan Maria invoice PDFs (text extraction) and correct line items in the database.
 * Usage: npx tsx scripts/rescan-maria-invoice-line-items.ts [--dry-run] [--limit N]
 *   [--use-cache] [--dos-claim-fallback] [--link-attachments]
 *
 * --dos-claim-fallback: when invoice # differs from DB, match PDF by claim + session-folder date.
 * --link-attachments: also create InvoiceAttachment records with Drive webViewLink.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import { extractPdfText } from "../src/lib/pdf-text";
import {
  isMariaInvoiceFilename,
  isMariaSessionFolderName,
  parseMariaInvoiceText,
} from "../src/lib/parse-maria-invoice-pdf";

const RESULTS_PATH = "scripts/rescan-maria-invoice-line-items-results.json";
const LOG_PATH = "scripts/rescan-maria-invoice-line-items-run.log";
const CACHE_PATH = "scripts/rescan-maria-invoice-line-items-cache.json";

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

function saveCache(collected: PdfScan[]) {
  writeFileSync(CACHE_PATH, JSON.stringify({ at: new Date().toISOString(), scans: collected }, null, 2));
}

type PdfScan = {
  claim: string;
  folder: string;
  sessionFolder: string;
  filename: string;
  fileId?: string;
  webViewLink?: string;
  size?: number;
  invoiceNumber: number;
  lineItems: { procedureCode: string; amount: number }[];
  totalDue: number | null;
  usedOcr: boolean;
  pdfText?: string;
};

type UpdateResult = {
  invoiceNumber: number;
  claim: string;
  action: "updated" | "skipped" | "missing_pdf" | "parse_failed" | "not_found";
  before?: string;
  after?: string;
  error?: string;
  matchMethod?: "invoice_number" | "dos_claim_fallback";
  pdfInvoiceNumber?: number;
  attachmentLinked?: boolean;
};

function log(lines: string[], message: string) {
  lines.push(message);
  console.log(message);
}

function scanQuality(scan: PdfScan): number {
  const lineSum = Math.round(scan.lineItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const total = scan.totalDue ?? lineSum;
  let score = scan.lineItems.length;
  if (scan.lineItems.every((i) => i.amount > 0 && i.amount <= 200)) score += 10;
  if (Math.abs(lineSum - total) <= 0.02) score += 100;
  return score;
}

function betterScan(a: PdfScan, b: PdfScan): PdfScan {
  return scanQuality(a) >= scanQuality(b) ? a : b;
}

function formatLines(items: { procedureCode: string; amount: number }[]): string {
  return items.map((i) => `${i.procedureCode}=$${i.amount.toFixed(2)}`).join(", ");
}

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

async function collectInvoicePdfs(
  accessToken: string,
  claim: string,
  folderName: string,
  clientFolderId: string,
  listClientFolderFiles: typeof import("../src/lib/google-drive").listClientFolderFiles,
  listClientFolderFilesWithLinks: typeof import("../src/lib/google-drive").listClientFolderFilesWithLinks,
  downloadFileBuffer: typeof import("../src/lib/google-drive").downloadFileBuffer,
  linkAttachments: boolean,
  limit: number | null,
  collected: PdfScan[],
  logLines: string[],
): Promise<void> {
  if (limit != null && collected.length >= limit) return;

  const listFn = linkAttachments ? listClientFolderFilesWithLinks : listClientFolderFiles;
  const top = await withRetry(`list ${folderName}`, () => listFn(accessToken, clientFolderId));

  const sessionFolders = top.filter(
    (f) => f.mimeType === "application/vnd.google-apps.folder" && isMariaSessionFolderName(f.name),
  );

  const scanTargets: { sessionName: string; sessionId: string; pdfs: typeof top }[] = [];
  for (const session of sessionFolders) {
    const files = await withRetry(`list ${session.name}`, () => listFn(accessToken, session.id));
    const invoicePdfs = files.filter((f) => isMariaInvoiceFilename(f.name));
    if (invoicePdfs.length) {
      scanTargets.push({ sessionName: session.name, sessionId: session.id, pdfs: invoicePdfs });
    }
  }

  // Some clients may have invoice PDFs at client-folder root.
  const rootPdfs = top.filter((f) => isMariaInvoiceFilename(f.name));
  if (rootPdfs.length) {
    scanTargets.push({ sessionName: "", sessionId: clientFolderId, pdfs: rootPdfs });
  }

  for (const target of scanTargets) {
    for (const pdf of target.pdfs) {
      if (limit != null && collected.length >= limit) return;
      try {
        const buf = await withRetry(`download ${pdf.name}`, () =>
          downloadFileBuffer(accessToken, pdf),
        );
        const { text, usedOcr } = await extractPdfText(buf);
        const parsed = parseMariaInvoiceText(text);
        if (!parsed) {
          log(logLines, `  PARSE FAIL ${folderName}/${target.sessionName}/${pdf.name}`);
          continue;
        }
        collected.push({
          claim,
          folder: folderName,
          sessionFolder: target.sessionName,
          filename: pdf.name,
          fileId: "id" in pdf ? pdf.id : undefined,
          webViewLink: "webViewLink" in pdf ? pdf.webViewLink : undefined,
          size: "size" in pdf ? pdf.size : undefined,
          invoiceNumber: parsed.invoiceNumber,
          lineItems: parsed.lineItems,
          totalDue: parsed.totalDue,
          usedOcr,
          pdfText: text.slice(0, 8000),
        });
        saveCache(collected);
        log(
          logLines,
          `  #${parsed.invoiceNumber} ${claim}: ${formatLines(parsed.lineItems)} (${pdf.name})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(logLines, `  ERROR ${pdf.name}: ${message}`);
      }
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const useCache = process.argv.includes("--use-cache");
  const dosClaimFallback = process.argv.includes("--dos-claim-fallback");
  const linkAttachments = process.argv.includes("--link-attachments");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
  const logLines: string[] = [];

  const { prisma } = await import("../src/lib/prisma");
  const { getValidGoogleAccessToken } = await import("../src/lib/google-oauth");
  const {
    getTherapistFolderConfig,
    resolveTherapistFolderId,
    listClientFolders,
    listClientFolderFiles,
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

  const pdfScans: PdfScan[] = [];

  if (useCache) {
    const { readFileSync, existsSync } = await import("fs");
    if (existsSync(CACHE_PATH)) {
      const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as { scans: PdfScan[] };
      pdfScans.push(...cached.scans);
      log(logLines, `Loaded ${pdfScans.length} cached PDF scans from ${CACHE_PATH}`);
    }
  }

  if (!useCache || pdfScans.length === 0) {
    log(logLines, dryRun ? "DRY RUN" : "LIVE RUN");
    log(logLines, "Scanning Drive for Maria invoice PDFs…");

    for (const source of sources) {
      log(logLines, `\n${source.label}: ${source.folders.length} client folders`);
      for (const folder of source.folders) {
        const claim = folder.name.split(" - ")[0]?.trim().toUpperCase() ?? "";
        await collectInvoicePdfs(
          accessToken,
          claim,
          folder.name,
          folder.id,
          listClientFolderFiles,
          listClientFolderFilesWithLinks,
          downloadFileBuffer,
          linkAttachments,
          limit,
          pdfScans,
          logLines,
        );
      }
    }
  }

  const byInvoiceNum = new Map<number, PdfScan>();
  for (const scan of pdfScans) {
    if (scan.pdfText) {
      const reparsed = parseMariaInvoiceText(scan.pdfText);
      if (reparsed) {
        scan.lineItems = reparsed.lineItems;
        scan.totalDue = reparsed.totalDue;
      }
    }
    const existing = byInvoiceNum.get(scan.invoiceNumber);
    if (!existing) {
      byInvoiceNum.set(scan.invoiceNumber, scan);
      continue;
    }
    if (scan.lineItems.length > existing.lineItems.length) {
      byInvoiceNum.set(scan.invoiceNumber, scan);
      continue;
    }
    if (scan.lineItems.length === existing.lineItems.length) {
      byInvoiceNum.set(scan.invoiceNumber, betterScan(scan, existing));
    }
  }

  function scanForInvoice(
    invoiceNumber: number,
    claim: string,
    serviceDate?: Date | null,
  ): { scan: PdfScan; matchMethod: "invoice_number" | "dos_claim_fallback" } | undefined {
    const matches = pdfScans.filter((s) => s.invoiceNumber === invoiceNumber);
    if (matches.length) {
      const claimMatch = matches.filter((s) => s.claim === claim);
      if (claimMatch.length === 1) {
        return { scan: claimMatch[0], matchMethod: "invoice_number" };
      }
      if (claimMatch.length > 1) {
        return {
          scan: claimMatch.reduce((best, s) => betterScan(s, best)),
          matchMethod: "invoice_number",
        };
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

    const scan =
      dosMatches.length === 1
        ? dosMatches[0]!
        : dosMatches.reduce((best, s) => betterScan(s, best));
    return { scan, matchMethod: "dos_claim_fallback" };
  }

  log(logLines, `\nParsed ${pdfScans.length} PDFs → ${byInvoiceNum.size} unique invoice numbers`);

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: maria.id, status: "BILLED" },
    include: {
      client: { select: { lniClaimNumber: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      ...(linkAttachments ? { attachments: true } : {}),
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const results: UpdateResult[] = [];
  let updated = 0;
  let skipped = 0;
  let missingPdf = 0;
  let attachmentsLinked = 0;

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
        ? ` (DOS+claim fallback, PDF #${scan.invoiceNumber})`
        : "";

    const before = formatLines(
      invoice.lineItems.map((l) => ({
        procedureCode: l.procedureCode,
        amount: Number(l.amount),
      })),
    );
    const after = formatLines(scan.lineItems);
    const dbTotal = Math.round(Number(invoice.totalAmount) * 100) / 100;
    const lineSum = Math.round(scan.lineItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const pdfTotal =
      scan.totalDue != null ? Math.round(scan.totalDue * 100) / 100 : lineSum;

    const lineItemsChanged = before !== after;
    let attachmentLinked = false;

    if (!lineItemsChanged) {
      skipped++;
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "skipped",
        before,
        after,
        matchMethod,
        pdfInvoiceNumber: scan.invoiceNumber,
      });
      if (matchMethod === "dos_claim_fallback") {
        log(logLines, `${prefix} OK via DOS+claim${fallbackNote}`);
      }
    } else if (Math.abs(dbTotal - pdfTotal) > 0.02) {
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "parse_failed",
        before,
        after,
        error: `Total mismatch DB $${dbTotal.toFixed(2)} vs PDF $${pdfTotal.toFixed(2)}`,
      });
      log(logLines, `${prefix} TOTAL MISMATCH — ${before} → ${after}`);
      continue;
    } else if (Math.abs(lineSum - pdfTotal) > 0.02) {
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "parse_failed",
        before,
        after,
        error: `Line sum $${lineSum.toFixed(2)} does not match PDF total $${pdfTotal.toFixed(2)}`,
      });
      log(logLines, `${prefix} LINE SUM MISMATCH — ${before} → ${after}`);
      continue;
    } else {
      const serviceDateForUpdate = serviceDate ?? new Date();

      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              totalAmount: pdfTotal,
              lineItems: {
                create: scan.lineItems.map((item, index) => ({
                  serviceDate: serviceDateForUpdate,
                  procedureCode: item.procedureCode,
                  amount: item.amount,
                  units: 1,
                  sortOrder: index,
                })),
              },
            },
          });
        });
      }

      updated++;
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "updated",
        before,
        after,
        matchMethod,
        pdfInvoiceNumber: scan.invoiceNumber,
      });
      log(logLines, `${prefix} UPDATE${fallbackNote} ${before} → ${after}`);
    }

    if (
      linkAttachments &&
      scan.fileId &&
      scan.webViewLink &&
      scan.filename &&
      scan.size != null
    ) {
      const existingFileIds = new Set(
        (invoice.attachments ?? [])
          .map((a) => parseDriveFileIdFromUrl(a.blobUrl))
          .filter((id): id is string => Boolean(id)),
      );
      const existingFilenames = new Set((invoice.attachments ?? []).map((a) => a.filename));

      if (!existingFileIds.has(scan.fileId) && !existingFilenames.has(scan.filename)) {
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
        attachmentLinked = true;
        attachmentsLinked++;
        log(logLines, `${prefix} ATTACHMENT → ${scan.filename}`);
      }
    }

    if (attachmentLinked && results[results.length - 1]) {
      results[results.length - 1]!.attachmentLinked = true;
    }
  }

  const summary = {
    at: new Date().toISOString(),
    dryRun,
    dosClaimFallback,
    linkAttachments,
    pdfsScanned: pdfScans.length,
    uniqueInvoicesParsed: byInvoiceNum.size,
    dbInvoices: invoices.length,
    updated,
    skipped,
    missingPdf,
    parseFailed: results.filter((r) => r.action === "parse_failed").length,
    attachmentsLinked,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  writeFileSync(LOG_PATH, logLines.join("\n"));

  log(
    logLines,
    `\nDone: ${updated} updated, ${skipped} already correct, ${missingPdf} missing PDF, ${summary.parseFailed} total mismatches`,
  );
  if (linkAttachments) {
    log(logLines, `Attachments linked: ${attachmentsLinked}`);
  }
  log(logLines, `Results: ${RESULTS_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
