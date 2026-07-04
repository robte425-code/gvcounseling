/**
 * Import Steven historical invoices from billing spreadsheet.
 * Usage: npx tsx scripts/import-steven-invoices.ts [--dry-run]
 *
 * Line items are placeholders (inferred from invoice total only). After import, run:
 *   npx tsx scripts/rescan-steven-invoice-line-items.ts
 * to OCR invoice PDFs in Drive and set correct CPT breakdowns (96158/96159/etc).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";
import { inferPaymentStatusFromSpreadsheet } from "../src/lib/invoice-payment-status";
import { parseLniDate } from "../src/lib/lni-pay-periods";

const SPREADSHEET_PATH = "/Users/ghim/Downloads/Steven_ Client Billing Status (1).xlsx";
const SHEETS = ["Invoiced 2025", "Invoiced 2026"] as const;
const RESULTS_PATH = "scripts/import-steven-invoices-results.json";
const LOG_PATH = "scripts/import-steven-invoices-run.log";

type SheetName = (typeof SHEETS)[number];

type SpreadsheetRow = {
  sheet: SheetName;
  cutoff: Date | null;
  dos: Date;
  billed: Date;
  invoiceNum: number;
  amount: number;
  claim: string;
  name: string;
  lniPaid: Date | null;
  lniPayment: string;
};

type ImportResult = {
  sheet: SheetName;
  invoiceNum: number;
  claim: string;
  amount: number;
  action: "created" | "updated" | "skipped" | "failed";
  error?: string;
  warnings?: string[];
};

function logLine(lines: string[], message: string) {
  lines.push(message);
  console.log(message);
}

function parseExcelDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const text = String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  if (!text) return null;
  const lni = parseLniDate(text.replace(/\//g, "-"));
  if (lni) return lni;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseInvoiceNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseClaim(value: unknown): string | null {
  if (value == null) return null;
  const claim = String(value).trim().toUpperCase();
  return claim || null;
}

function readSpreadsheetRows(): SpreadsheetRow[] {
  const workbook = XLSX.readFile(SPREADSHEET_PATH, { cellDates: true });
  const rows: SpreadsheetRow[] = [];
  let lastCutoff: Date | null = null;

  for (const sheetName of SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

    const raw = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row) continue;

      const invoiceNum = parseInvoiceNum(row[3]);
      const claim = parseClaim(row[5]);
      const amount = parseAmount(row[4]);
      const dos = parseExcelDate(row[1]);
      const billed = parseExcelDate(row[2]);
      const cutoff = parseExcelDate(row[0]);

      if (cutoff) lastCutoff = cutoff;

      if (!invoiceNum || !claim || amount == null || !dos || !billed) continue;

      rows.push({
        sheet: sheetName,
        cutoff: cutoff ?? lastCutoff,
        dos,
        billed,
        invoiceNum,
        amount,
        claim,
        name: String(row[6] ?? "").trim(),
        lniPaid: parseExcelDate(row[11]),
        lniPayment: String(row[14] ?? "").trim(),
      });
    }
  }

  return rows;
}

function inferLineItem(amount: number): { procedureCode: string; amount: number; units: number } {
  if (amount === 85) return { procedureCode: "96156", amount: 85, units: 1 };
  if (amount === 42.5) return { procedureCode: "96158", amount: 42.5, units: 1 };
  if (amount === 63.75) return { procedureCode: "96158", amount: 63.75, units: 1 };
  throw new Error(`Unknown amount $${amount.toFixed(2)} — expected 85, 42.50, or 63.75`);
}


/** Spreadsheet cutoffs that differ from the official L&I schedule. */
const CUTOFF_ALIASES: Record<string, string> = {
  "2026-02-26": "2026-02-27",
};

async function findPayPeriodByCutoff(
  prisma: Awaited<ReturnType<typeof import("../src/lib/prisma").createPrismaClient>>,
  cutoffDate: Date,
) {
  const key = cutoffDate.toISOString().slice(0, 10);
  const resolved = CUTOFF_ALIASES[key]
    ? new Date(`${CUTOFF_ALIASES[key]}T00:00:00.000Z`)
    : cutoffDate;
  const dayStart = Date.UTC(
    resolved.getUTCFullYear(),
    resolved.getUTCMonth(),
    resolved.getUTCDate(),
  );
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return prisma.payPeriod.findFirst({
    where: {
      cutoffDate: { gte: new Date(dayStart), lt: new Date(dayEnd) },
    },
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const logLines: string[] = [];

  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const steven = await prisma.user.findFirst({
    where: { email: "steven@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!steven) throw new Error("Steven therapist not found");

  const spreadsheetRows = readSpreadsheetRows();
  logLine(logLines, `Read ${spreadsheetRows.length} invoice rows from spreadsheet`);
  if (dryRun) logLine(logLines, "DRY RUN — no database writes");

  const clients = await prisma.client.findMany({
    where: { lniClaimNumber: { in: [...new Set(spreadsheetRows.map((r) => r.claim))] } },
    select: { id: true, lniClaimNumber: true, therapistId: true, firstName: true, lastName: true },
  });
  const clientByClaim = new Map(clients.map((c) => [c.lniClaimNumber, c]));

  const existingInvoices = await prisma.invoice.findMany({
    where: { therapistId: steven.id },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      totalAmount: true,
      clientId: true,
      paymentStatus: true,
      payPeriodId: true,
      lniPaidAt: true,
    },
  });
  const existingByNumber = new Map(existingInvoices.map((inv) => [inv.invoiceNumber, inv]));

  const results: ImportResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let totalAmount = 0;
  const missingPayPeriods = new Set<string>();
  const missingClients = new Set<string>();

  for (const row of spreadsheetRows) {
    const prefix = `#${row.invoiceNum} ${row.claim}`;
    const warnings: string[] = [];
    const client = clientByClaim.get(row.claim);

    if (!client) {
      missingClients.add(row.claim);
      failed++;
      const error = `Client not found for claim ${row.claim}`;
      results.push({
        sheet: row.sheet,
        invoiceNum: row.invoiceNum,
        claim: row.claim,
        amount: row.amount,
        action: "failed",
        error,
      });
      logLine(logLines, `${prefix} FAIL — ${error}`);
      continue;
    }

    if (client.therapistId && client.therapistId !== steven.id) {
      warnings.push(`Client assigned to another therapist (${client.firstName} ${client.lastName})`);
    }

    let payPeriodId: string | null = null;
    if (row.cutoff) {
      const payPeriod = await findPayPeriodByCutoff(prisma, row.cutoff);
      if (payPeriod) {
        payPeriodId = payPeriod.id;
      } else {
        const key = row.cutoff.toISOString().slice(0, 10);
        missingPayPeriods.add(key);
        warnings.push(`No pay period for cutoff ${key}`);
      }
    } else {
      warnings.push("Missing cutoff date — pay period not assigned");
    }

    let lineItem: ReturnType<typeof inferLineItem>;
    try {
      lineItem = inferLineItem(row.amount);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        sheet: row.sheet,
        invoiceNum: row.invoiceNum,
        claim: row.claim,
        amount: row.amount,
        action: "failed",
        error: message,
      });
      logLine(logLines, `${prefix} FAIL — ${message}`);
      continue;
    }

    const { paymentStatus, lniPaidAt } = inferPaymentStatusFromSpreadsheet(
      row.lniPaid,
      row.lniPayment,
    );
    const existing = existingByNumber.get(row.invoiceNum);

    if (existing) {
      const sameClient = existing.clientId === client.id;
      const sameAmount = Number(existing.totalAmount) === row.amount;
      const samePayPeriod = (existing.payPeriodId ?? null) === payPeriodId;
      const samePayment =
        existing.paymentStatus === paymentStatus &&
        ((existing.lniPaidAt?.getTime() ?? null) === (lniPaidAt?.getTime() ?? null));
      if (existing.status === "BILLED" && sameClient && sameAmount && samePayPeriod && samePayment) {
        skipped++;
        results.push({
          sheet: row.sheet,
          invoiceNum: row.invoiceNum,
          claim: row.claim,
          amount: row.amount,
          action: "skipped",
          warnings: warnings.length ? warnings : undefined,
        });
        logLine(logLines, `${prefix} SKIP — already imported`);
        continue;
      }

      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.invoiceLineItem.deleteMany({ where: { invoiceId: existing.id } });
          await tx.invoice.update({
            where: { id: existing.id },
            data: {
              clientId: client.id,
              status: "BILLED",
              paymentStatus,
              lniPaidAt,
              billedAt: row.billed,
              submittedAt: row.billed,
              payPeriodId,
              totalAmount: row.amount,
              lineItems: {
                create: {
                  serviceDate: row.dos,
                  procedureCode: lineItem.procedureCode,
                  amount: lineItem.amount,
                  units: lineItem.units,
                  sortOrder: 0,
                },
              },
            },
          });
        });
      }

      updated++;
      totalAmount += row.amount;
      results.push({
        sheet: row.sheet,
        invoiceNum: row.invoiceNum,
        claim: row.claim,
        amount: row.amount,
        action: "updated",
        warnings: warnings.length ? warnings : undefined,
      });
      logLine(
        logLines,
        `${prefix} UPDATE $${row.amount.toFixed(2)} ${paymentStatus}${warnings.length ? ` (${warnings.join("; ")})` : ""}`,
      );
      continue;
    }

    if (!dryRun) {
      await prisma.invoice.create({
        data: {
          therapistId: steven.id,
          clientId: client.id,
          invoiceNumber: row.invoiceNum,
          status: "BILLED",
          paymentStatus,
          lniPaidAt,
          billedAt: row.billed,
          submittedAt: row.billed,
          payPeriodId,
          totalAmount: row.amount,
          lineItems: {
            create: {
              serviceDate: row.dos,
              procedureCode: lineItem.procedureCode,
              amount: lineItem.amount,
              units: lineItem.units,
              sortOrder: 0,
            },
          },
        },
      });
    }

    created++;
    totalAmount += row.amount;
    results.push({
      sheet: row.sheet,
      invoiceNum: row.invoiceNum,
      claim: row.claim,
      amount: row.amount,
      action: "created",
      warnings: warnings.length ? warnings : undefined,
    });
    logLine(
      logLines,
      `${prefix} CREATE $${row.amount.toFixed(2)} ${paymentStatus} ${lineItem.procedureCode}${warnings.length ? ` (${warnings.join("; ")})` : ""}`,
    );
  }

  const paidCount = results.filter(
    (r) => r.action !== "failed" && spreadsheetRows.find((s) => s.invoiceNum === r.invoiceNum)?.lniPaid,
  ).length;
  const unpaidCount = results.filter((r) => r.action !== "failed").length - paidCount;

  const summary = {
    at: new Date().toISOString(),
    dryRun,
    spreadsheet: SPREADSHEET_PATH,
    totalRows: spreadsheetRows.length,
    created,
    updated,
    skipped,
    failed,
    totalAmount,
    paymentStatus: { paid: paidCount, unpaid: unpaidCount },
    missingClients: [...missingClients],
    missingPayPeriods: [...missingPayPeriods].sort(),
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  writeFileSync(LOG_PATH, logLines.join("\n") + "\n");

  logLine(
    logLines,
    `\nDone: ${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed — $${totalAmount.toFixed(2)} total`,
  );
  logLine(logLines, `Results: ${RESULTS_PATH}`);
  logLine(logLines, `Log: ${LOG_PATH}`);

  if (missingClients.size) {
    logLine(logLines, `\nMissing clients: ${[...missingClients].join(", ")}`);
  }
  if (missingPayPeriods.size) {
    logLine(logLines, `\nMissing pay periods for cutoffs: ${[...missingPayPeriods].sort().join(", ")}`);
  }

  if (failed > 0) process.exit(1);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
