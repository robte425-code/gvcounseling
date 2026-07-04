/**
 * Audit invoice paymentStatus against spreadsheet "LNI Payment" column.
 * Usage: npx tsx scripts/audit-invoice-payment-status.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";
import type { PaymentStatus } from "../src/generated/prisma/client";
import { inferPaymentStatusFromSpreadsheet } from "../src/lib/invoice-payment-status";
import { parseLniDate } from "../src/lib/lni-pay-periods";

const MARIA_SPREADSHEET = "/Users/ghim/Downloads/Maria_ Client Billing Status.xlsx";
const STEVEN_SPREADSHEET = "/Users/ghim/Downloads/Steven_ Client Billing Status (1).xlsx";
const OUTPUT_PATH = "scripts/audit-invoice-payment-status-results.json";

const MARIA_INVOICE_REMAPS: Record<string, number> = {
  "BL77528:358": 357,
  "BL77059:531": 532,
  "BL20510:670": 936,
  "AU51037:93": 1015,
};

type SpreadsheetEntry = {
  therapist: "maria" | "steven";
  resolvedInvoiceNum: number;
  claim: string;
  lniPaid: Date | null;
  lniPayment: string;
  expected: ReturnType<typeof inferPaymentStatusFromSpreadsheet>;
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

function readMariaRows(): SpreadsheetEntry[] {
  const workbook = XLSX.readFile(MARIA_SPREADSHEET, { cellDates: true });
  const rows: SpreadsheetEntry[] = [];

  for (const sheetName of ["Invoiced 2024", "Invoiced 2025", "Invoiced 2026"]) {
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
      if (!invoiceNum || !claim || amount == null || !dos || !billed) continue;

      const resolvedInvoiceNum = MARIA_INVOICE_REMAPS[`${claim}:${invoiceNum}`] ?? invoiceNum;
      const lniPaid = parseExcelDate(row[11]);
      const lniPayment = String(row[14] ?? "").trim();
      rows.push({
        therapist: "maria",
        resolvedInvoiceNum,
        claim,
        lniPaid,
        lniPayment,
        expected: inferPaymentStatusFromSpreadsheet(lniPaid, lniPayment),
      });
    }
  }
  return rows;
}

function readStevenRows(): SpreadsheetEntry[] {
  const workbook = XLSX.readFile(STEVEN_SPREADSHEET, { cellDates: true });
  const rows: SpreadsheetEntry[] = [];

  for (const sheetName of ["Invoiced 2025", "Invoiced 2026"]) {
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
      if (!invoiceNum || !claim || amount == null || !dos || !billed) continue;

      const lniPaid = parseExcelDate(row[11]);
      const lniPayment = String(row[14] ?? "").trim();
      rows.push({
        therapist: "steven",
        resolvedInvoiceNum: invoiceNum,
        claim,
        lniPaid,
        lniPayment,
        expected: inferPaymentStatusFromSpreadsheet(lniPaid, lniPayment),
      });
    }
  }
  return rows;
}

function sameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
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
      row.therapist === "maria"
        ? therapistIdByEmail["maria@gvcounseling.com"]
        : therapistIdByEmail["steven@gvcounseling.com"];
    spreadsheetByKey.set(`${therapistId}:${row.resolvedInvoiceNum}`, row);
  }

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: { in: therapists.map((t) => t.id) } },
    select: {
      id: true,
      invoiceNumber: true,
      therapistId: true,
      paymentStatus: true,
      lniPaidAt: true,
      client: { select: { lniClaimNumber: true } },
    },
    orderBy: [{ therapistId: "asc" }, { invoiceNumber: "asc" }],
  });

  const summary = {
    spreadsheetRows: spreadsheetRows.length,
    dbInvoices: invoices.length,
    correct: 0,
    wrongStatus: 0,
    wrongLniPaidAt: 0,
    noSpreadsheetRow: 0,
    fixed: 0,
    expectedByStatus: {} as Record<PaymentStatus, number>,
  };

  const issues: {
    therapist: string;
    invoiceNumber: number;
    claim: string;
    lniPayment: string;
    expectedStatus: PaymentStatus;
    actualStatus: PaymentStatus | null;
    expectedLniPaidAt: string | null;
    actualLniPaidAt: string | null;
    issue: string;
  }[] = [];

  for (const row of spreadsheetRows) {
    summary.expectedByStatus[row.expected.paymentStatus] =
      (summary.expectedByStatus[row.expected.paymentStatus] ?? 0) + 1;
  }

  for (const inv of invoices) {
    const key = `${inv.therapistId}:${inv.invoiceNumber}`;
    const sheet = spreadsheetByKey.get(key);
    const therapist =
      inv.therapistId === therapistIdByEmail["maria@gvcounseling.com"] ? "maria" : "steven";

    if (!sheet) {
      summary.noSpreadsheetRow++;
      issues.push({
        therapist,
        invoiceNumber: inv.invoiceNumber,
        claim: inv.client.lniClaimNumber,
        lniPayment: "",
        expectedStatus: "UNPAID",
        actualStatus: inv.paymentStatus,
        expectedLniPaidAt: null,
        actualLniPaidAt: inv.lniPaidAt?.toISOString().slice(0, 10) ?? null,
        issue: "no_spreadsheet_row",
      });
      continue;
    }

    const statusMatch = inv.paymentStatus === sheet.expected.paymentStatus;
    const dateMatch = sameDate(inv.lniPaidAt, sheet.expected.lniPaidAt);

    if (statusMatch && dateMatch) {
      summary.correct++;
      continue;
    }

    if (!statusMatch) summary.wrongStatus++;
    if (!dateMatch) summary.wrongLniPaidAt++;

    issues.push({
      therapist,
      invoiceNumber: inv.invoiceNumber,
      claim: sheet.claim,
      lniPayment: sheet.lniPayment || "(blank)",
      expectedStatus: sheet.expected.paymentStatus,
      actualStatus: inv.paymentStatus,
      expectedLniPaidAt: sheet.expected.lniPaidAt?.toISOString().slice(0, 10) ?? null,
      actualLniPaidAt: inv.lniPaidAt?.toISOString().slice(0, 10) ?? null,
      issue: !statusMatch ? "wrong_status" : "wrong_lni_paid_at",
    });

    if (fix) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          paymentStatus: sheet.expected.paymentStatus,
          lniPaidAt: sheet.expected.lniPaidAt,
        },
      });
      summary.fixed++;
    }
  }

  const report = {
    at: new Date().toISOString(),
    fix,
    summary,
    issues,
    lniPaymentValueCounts: Object.fromEntries(
      [...spreadsheetRows.reduce((m, r) => {
        const key = r.lniPayment || "(blank)";
        m.set(key, (m.get(key) ?? 0) + 1);
        return m;
      }, new Map<string, number>())],
    ),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log("Payment status audit");
  console.log(`  Spreadsheet rows: ${summary.spreadsheetRows}`);
  console.log(`  DB invoices:      ${summary.dbInvoices}`);
  console.log(`  Correct:          ${summary.correct}`);
  console.log(`  Wrong status:     ${summary.wrongStatus}`);
  console.log(`  Wrong lniPaidAt:  ${summary.wrongLniPaidAt}`);
  console.log(`  No spreadsheet:   ${summary.noSpreadsheetRow}`);
  console.log(`  Expected:         ${JSON.stringify(summary.expectedByStatus)}`);
  if (fix) console.log(`  Fixed:            ${summary.fixed}`);
  console.log(`Results: ${OUTPUT_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
