/**
 * Audit invoice pay-period assignments against billing spreadsheets.
 * Usage: npx tsx scripts/audit-invoice-pay-periods.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";
import { parseLniDate } from "../src/lib/lni-pay-periods";

const MARIA_SPREADSHEET = "/Users/ghim/Downloads/Maria_ Client Billing Status.xlsx";
const STEVEN_SPREADSHEET = "/Users/ghim/Downloads/Steven_ Client Billing Status (1).xlsx";
const OUTPUT_PATH = "scripts/audit-invoice-pay-periods-results.json";

const MARIA_CUTOFF_ALIASES: Record<string, string> = {
  "2025-10-09": "2025-10-10",
  "2025-10-23": "2025-10-24",
  "2025-11-06": "2025-11-07",
  "2025-11-20": "2025-11-21",
  "2025-12-04": "2025-12-05",
  "2025-12-18": "2025-12-19",
  "2026-02-12": "2026-02-13",
  "2026-02-26": "2026-02-27",
  "2026-03-12": "2026-03-13",
  "2026-03-26": "2026-03-27",
};

const STEVEN_CUTOFF_ALIASES: Record<string, string> = {
  "2026-02-26": "2026-02-27",
};

const MARIA_INVOICE_REMAPS: Record<string, number> = {
  "BL77528:358": 357,
  "BL77059:531": 532,
  "BL20510:670": 936,
  "AU51037:93": 1015,
};

type SpreadsheetEntry = {
  therapist: "maria" | "steven";
  sheet: string;
  invoiceNum: number;
  resolvedInvoiceNum: number;
  claim: string;
  amount: number;
  cutoff: string | null;
  resolvedCutoff: string | null;
};

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
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
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

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function resolveCutoff(cutoff: string | null, aliases: Record<string, string>): string | null {
  if (!cutoff) return null;
  return aliases[cutoff] ?? cutoff;
}

function readMariaRows(): SpreadsheetEntry[] {
  const workbook = XLSX.readFile(MARIA_SPREADSHEET, { cellDates: true });
  const sheets = ["Invoiced 2024", "Invoiced 2025", "Invoiced 2026"];
  const rows: SpreadsheetEntry[] = [];
  let lastCutoff: Date | null = null;

  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const raw = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const sheetRows: SpreadsheetEntry[] = [];
    let firstCutoffInSheet: Date | null = null;

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row) continue;
      const invoiceNum = parseInvoiceNum(row[3]);
      const claim = parseClaim(row[5]);
      const amount = parseAmount(row[4]);
      const cutoff = parseExcelDate(row[0]);
      if (cutoff) {
        lastCutoff = cutoff;
        if (!firstCutoffInSheet) firstCutoffInSheet = cutoff;
      }
      if (!invoiceNum || !claim || amount == null) continue;

      const cutoffIso = isoDate(cutoff ?? lastCutoff);
      const resolvedInvoiceNum =
        MARIA_INVOICE_REMAPS[`${claim}:${invoiceNum}`] ?? invoiceNum;

      sheetRows.push({
        therapist: "maria",
        sheet: sheetName,
        invoiceNum,
        resolvedInvoiceNum,
        claim,
        amount,
        cutoff: cutoffIso,
        resolvedCutoff: resolveCutoff(cutoffIso, MARIA_CUTOFF_ALIASES),
      });
    }

    // Rows before the first explicit cutoff (e.g. invoice #1 in "Invoiced 2024")
    // belong to the same pay period as the first cutoff in that sheet.
    if (firstCutoffInSheet) {
      const firstCutoffIso = isoDate(firstCutoffInSheet);
      const inferredCutoff = resolveCutoff(firstCutoffIso, MARIA_CUTOFF_ALIASES);
      for (const entry of sheetRows) {
        if (!entry.resolvedCutoff && inferredCutoff) {
          entry.cutoff = firstCutoffIso;
          entry.resolvedCutoff = inferredCutoff;
        }
      }
    }

    rows.push(...sheetRows);
  }
  return rows;
}

function readStevenRows(): SpreadsheetEntry[] {
  const workbook = XLSX.readFile(STEVEN_SPREADSHEET, { cellDates: true });
  const sheets = ["Invoiced 2025", "Invoiced 2026"];
  const rows: SpreadsheetEntry[] = [];
  let lastCutoff: Date | null = null;

  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
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

      const cutoffIso = isoDate(cutoff ?? lastCutoff);
      rows.push({
        therapist: "steven",
        sheet: sheetName,
        invoiceNum,
        resolvedInvoiceNum: invoiceNum,
        claim,
        amount,
        cutoff: cutoffIso,
        resolvedCutoff: resolveCutoff(cutoffIso, STEVEN_CUTOFF_ALIASES),
      });
    }
  }
  return rows;
}

async function findPayPeriodId(
  prisma: Awaited<ReturnType<typeof import("../src/lib/prisma").createPrismaClient>>,
  cutoffIso: string,
) {
  const cutoffDate = new Date(`${cutoffIso}T00:00:00.000Z`);
  const dayStart = Date.UTC(
    cutoffDate.getUTCFullYear(),
    cutoffDate.getUTCMonth(),
    cutoffDate.getUTCDate(),
  );
  const period = await prisma.payPeriod.findFirst({
    where: { cutoffDate: { gte: new Date(dayStart), lt: new Date(dayStart + 86400000) } },
    select: { id: true, cutoffDate: true },
  });
  return period;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const therapists = await prisma.user.findMany({
    where: { email: { in: ["maria@gvcounseling.com", "steven@gvcounseling.com"] } },
    select: { id: true, email: true },
  });
  const therapistIdByEmail = Object.fromEntries(therapists.map((t) => [t.email, t.id]));

  const spreadsheetRows = [...readMariaRows(), ...readStevenRows()];
  const spreadsheetByKey = new Map<string, SpreadsheetEntry>();
  for (const row of spreadsheetRows) {
    const therapistId =
      row.therapist === "maria" ? therapistIdByEmail["maria@gvcounseling.com"] : therapistIdByEmail["steven@gvcounseling.com"];
    spreadsheetByKey.set(`${therapistId}:${row.resolvedInvoiceNum}`, row);
  }

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: { in: therapists.map((t) => t.id) } },
    select: {
      id: true,
      invoiceNumber: true,
      therapistId: true,
      payPeriodId: true,
      payPeriod: { select: { cutoffDate: true } },
      client: { select: { lniClaimNumber: true } },
    },
    orderBy: [{ therapistId: "asc" }, { invoiceNumber: "asc" }],
  });

  const summary = {
    spreadsheetRows: spreadsheetRows.length,
    dbInvoices: invoices.length,
    correct: 0,
    missingSpreadsheetCutoff: 0,
    missingDbAssignment: 0,
    wrongAssignment: 0,
    noSpreadsheetRow: 0,
    missingPayPeriodInDb: 0,
    fixed: 0,
  };

  const issues: {
    invoiceNumber: number;
    claim: string;
    therapist: string;
    issue: string;
    spreadsheetCutoff?: string | null;
    expectedCutoff?: string | null;
    actualCutoff?: string | null;
  }[] = [];

  for (const inv of invoices) {
    const key = `${inv.therapistId}:${inv.invoiceNumber}`;
    const sheet = spreadsheetByKey.get(key);
    const therapist =
      inv.therapistId === therapistIdByEmail["maria@gvcounseling.com"] ? "maria" : "steven";

    if (!sheet) {
      summary.noSpreadsheetRow++;
      issues.push({
        invoiceNumber: inv.invoiceNumber,
        claim: inv.client.lniClaimNumber,
        therapist,
        issue: "no_spreadsheet_row",
      });
      continue;
    }

    if (!sheet.resolvedCutoff) {
      summary.missingSpreadsheetCutoff++;
      if (!inv.payPeriodId) {
        summary.missingDbAssignment++;
      } else {
        summary.correct++;
      }
      issues.push({
        invoiceNumber: inv.invoiceNumber,
        claim: sheet.claim,
        therapist,
        issue: "spreadsheet_missing_cutoff",
        spreadsheetCutoff: sheet.cutoff,
      });
      continue;
    }

    const expectedPeriod = await findPayPeriodId(prisma, sheet.resolvedCutoff);
    if (!expectedPeriod) {
      summary.missingPayPeriodInDb++;
      issues.push({
        invoiceNumber: inv.invoiceNumber,
        claim: sheet.claim,
        therapist,
        issue: "pay_period_not_in_db",
        expectedCutoff: sheet.resolvedCutoff,
        spreadsheetCutoff: sheet.cutoff,
        actualCutoff: inv.payPeriod?.cutoffDate.toISOString().slice(0, 10) ?? null,
      });
      continue;
    }

    const actualCutoff = inv.payPeriod?.cutoffDate.toISOString().slice(0, 10) ?? null;
    const expectedCutoff = expectedPeriod.cutoffDate.toISOString().slice(0, 10);

    if (inv.payPeriodId === expectedPeriod.id) {
      summary.correct++;
      continue;
    }

    if (!inv.payPeriodId) {
      summary.missingDbAssignment++;
      issues.push({
        invoiceNumber: inv.invoiceNumber,
        claim: sheet.claim,
        therapist,
        issue: "missing_db_assignment",
        expectedCutoff,
        spreadsheetCutoff: sheet.cutoff,
      });
      if (fix) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { payPeriodId: expectedPeriod.id },
        });
        summary.fixed++;
      }
      continue;
    }

    summary.wrongAssignment++;
    issues.push({
      invoiceNumber: inv.invoiceNumber,
      claim: sheet.claim,
      therapist,
      issue: "wrong_assignment",
      expectedCutoff,
      spreadsheetCutoff: sheet.cutoff,
      actualCutoff,
    });
    if (fix) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { payPeriodId: expectedPeriod.id },
      });
      summary.fixed++;
    }
  }

  const report = {
    at: new Date().toISOString(),
    fix,
    summary,
    issues,
    missingCutoffInvoices: issues
      .filter((i) => i.issue === "spreadsheet_missing_cutoff")
      .map((i) => ({ therapist: i.therapist, invoice: i.invoiceNumber, claim: i.claim })),
    unassignedInvoices: issues
      .filter((i) => i.issue === "missing_db_assignment")
      .map((i) => ({
        therapist: i.therapist,
        invoice: i.invoiceNumber,
        claim: i.claim,
        expectedCutoff: i.expectedCutoff,
      })),
    wrongAssignments: issues
      .filter((i) => i.issue === "wrong_assignment")
      .map((i) => ({
        therapist: i.therapist,
        invoice: i.invoiceNumber,
        claim: i.claim,
        expected: i.expectedCutoff,
        actual: i.actualCutoff,
      })),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log("Pay period audit");
  console.log(`  Spreadsheet rows: ${summary.spreadsheetRows}`);
  console.log(`  DB invoices:      ${summary.dbInvoices}`);
  console.log(`  Correct:          ${summary.correct}`);
  console.log(`  Missing cutoff in spreadsheet: ${summary.missingSpreadsheetCutoff}`);
  console.log(`  Missing DB assignment:         ${summary.missingDbAssignment}`);
  console.log(`  Wrong assignment:              ${summary.wrongAssignment}`);
  console.log(`  Pay period not in DB:          ${summary.missingPayPeriodInDb}`);
  console.log(`  No spreadsheet row:            ${summary.noSpreadsheetRow}`);
  if (fix) console.log(`  Fixed:                         ${summary.fixed}`);
  console.log(`Results: ${OUTPUT_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
