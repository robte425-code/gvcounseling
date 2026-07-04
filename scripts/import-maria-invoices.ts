/**
 * Import Maria historical invoices from billing spreadsheet.
 * Usage: npx tsx scripts/import-maria-invoices.ts [--dry-run]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";
import type { PaymentStatus } from "../src/generated/prisma/client";
import { inferPaymentStatusFromSpreadsheet } from "../src/lib/invoice-payment-status";
import { parseLniDate } from "../src/lib/lni-pay-periods";
import { resolveFeeAmount, type FeeScheduleRow } from "../src/lib/procedure-fee-schedule";

const SPREADSHEET_PATH = "/Users/ghim/Downloads/Maria_ Client Billing Status.xlsx";
const SHEETS = ["Invoiced 2024", "Invoiced 2025", "Invoiced 2026"] as const;
const RESULTS_PATH = "scripts/import-maria-invoices-results.json";
const LOG_PATH = "scripts/import-maria-invoices-run.log";

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

type LineItem = { procedureCode: string; amount: number; units: number };

type ImportResult = {
  sheet: SheetName;
  invoiceNum: number;
  resolvedInvoiceNum: number;
  claim: string;
  amount: number;
  action: "created" | "updated" | "skipped" | "failed";
  paymentStatus?: PaymentStatus;
  procedureCodes?: string[];
  error?: string;
  warnings?: string[];
};

/** Spreadsheet cutoffs that differ from pay periods in the DB. */
const CUTOFF_ALIASES: Record<string, string> = {
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

const PHONE_CODE_BY_AMOUNT: Record<number, string> = {
  12: "98966",
  22.2: "98967",
  30.29: "98968",
};

/** 96156 billed at 75% (partial BHI). */
const PARTIAL_BHI_AMOUNTS = new Set([48.75, 52.5, 56.25, 57.75]);

const MARIA_HISTORICAL_FEES: { effectiveFrom: string; fees: Record<string, number> }[] = [
  {
    effectiveFrom: "2024-03-01",
    fees: {
      "96156": 65,
      "96158": 32.5,
      "96159": 16.25,
      "90837": 90,
      "90834": 67.5,
      "90832": 35,
      "9919M": 30.29,
      "9918M": 24.23,
      "1073M": 27.56,
    },
  },
  {
    effectiveFrom: "2024-05-10",
    fees: {
      "96156": 70,
      "96158": 35,
      "96159": 17.5,
      "90837": 90,
      "90834": 67.5,
      "90832": 35,
      "9919M": 30.29,
      "9918M": 24.23,
      "1073M": 27.56,
    },
  },
  {
    effectiveFrom: "2025-03-01",
    fees: {
      "96156": 75,
      "96158": 37.5,
      "96159": 18.75,
      "90837": 95,
      "90834": 71.25,
      "90832": 47.5,
      "9919M": 33.21,
      "9918M": 26.57,
      "1073M": 30.21,
    },
  },
  {
    effectiveFrom: "2026-03-01",
    fees: {
      "96156": 77,
      "96158": 38.5,
      "96159": 19.25,
      "90837": 97,
      "90834": 72.75,
      "90832": 48.5,
      "9919M": 34.45,
      "9918M": 27.56,
      "1073M": 31.34,
    },
  },
];

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
  const mdy4 = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy4) {
    return new Date(Date.UTC(Number(mdy4[3]), Number(mdy4[1]) - 1, Number(mdy4[2])));
  }
  const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdy) {
    let year = Number(mdy[3]);
    year += year >= 70 ? 1900 : 2000;
    return new Date(Date.UTC(year, Number(mdy[1]) - 1, Number(mdy[2])));
  }
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

function readLniCutoffPaymentMap(workbook: XLSX.WorkBook): Map<string, Date | null> {
  const sheet = workbook.Sheets["LNI Cutoff & Payment dates"];
  const map = new Map<string, Date | null>();
  if (!sheet) return map;

  const raw = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    for (const col of [0, 3]) {
      const cutoff = parseLniDate(String(row[col] ?? "").replace(/\//g, "-"));
      const paymentRaw = String(row[col + 1] ?? "")
        .split("\n")[0]
        .replace(/\//g, "-");
      const payment = parseLniDate(paymentRaw);
      if (cutoff) {
        map.set(cutoff.toISOString().slice(0, 10), payment);
      }
    }
  }
  return map;
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

function buildMariaFeeSchedule(serviceDate: Date): FeeScheduleRow[] {
  const day = serviceDate.toISOString().slice(0, 10);
  let active = MARIA_HISTORICAL_FEES[0]!;
  for (const schedule of MARIA_HISTORICAL_FEES) {
    if (day >= schedule.effectiveFrom) active = schedule;
  }
  return Object.entries(active.fees).map(([procedureCode, amount]) => ({
    procedureCode,
    amount,
    effectiveFrom: new Date(`${active.effectiveFrom}T00:00:00.000Z`),
    effectiveTo: null,
  }));
}

function amountsClose(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance;
}

function inferLineItems(amount: number, serviceDate: Date): LineItem[] {
  const phoneCode = PHONE_CODE_BY_AMOUNT[amount];
  if (phoneCode) {
    return [{ procedureCode: phoneCode, amount, units: 1 }];
  }

  if (PARTIAL_BHI_AMOUNTS.has(amount)) {
    return [{ procedureCode: "96156", amount, units: 1 }];
  }

  const fees = buildMariaFeeSchedule(serviceDate);
  const codes = [
    "96156",
    "96158",
    "96159",
    "90837",
    "90834",
    "90832",
    "9919M",
    "9918M",
    "1073M",
  ];

  for (const code of codes) {
    const fee = resolveFeeAmount(fees, code, serviceDate);
    if (fee != null && amountsClose(fee, amount)) {
      return [{ procedureCode: code, amount, units: 1 }];
    }
  }

  for (const schedule of MARIA_HISTORICAL_FEES) {
    for (const [code, fee] of Object.entries(schedule.fees)) {
      if (amountsClose(fee, amount)) {
        return [{ procedureCode: code, amount, units: 1 }];
      }
    }
  }

  const bhi58 = resolveFeeAmount(fees, "96158", serviceDate);
  const bhi59 = resolveFeeAmount(fees, "96159", serviceDate);
  if (bhi58 != null && bhi59 != null && amountsClose(bhi58 + bhi59, amount)) {
    return [
      { procedureCode: "96158", amount: bhi58, units: 1 },
      { procedureCode: "96159", amount: bhi59, units: 1 },
    ];
  }

  for (const schedule of MARIA_HISTORICAL_FEES) {
    const s58 = schedule.fees["96158"];
    const s59 = schedule.fees["96159"];
    if (s58 != null && s59 != null && amountsClose(s58 + s59, amount)) {
      return [
        { procedureCode: "96158", amount: s58, units: 1 },
        { procedureCode: "96159", amount: s59, units: 1 },
      ];
    }
  }

  if (amount === 33.21) return [{ procedureCode: "9919M", amount, units: 1 }];
  if (amount === 22.44) return [{ procedureCode: "98967", amount, units: 1 }];
  if (amount === 45) return [{ procedureCode: "90832", amount, units: 1 }];
  if (amount === 32.5) return [{ procedureCode: "96158", amount, units: 1 }];

  throw new Error(`Unknown amount $${amount.toFixed(2)} for DOS ${serviceDate.toISOString().slice(0, 10)}`);
}


/** Spreadsheet claim:invoiceNum pairs that collide with another row's invoice #. */
const INVOICE_NUMBER_REMAPS: Record<string, number> = {
  "BL77528:358": 357,
  "BL77059:531": 532,
  "BL20510:670": 936,
  /** BD45091 already uses #93; Ken Hales (AU51037) is stored as #1015. */
  "AU51037:93": 1015,
};

function spreadsheetRowKey(row: Pick<SpreadsheetRow, "claim" | "invoiceNum">): string {
  return `${row.claim}:${row.invoiceNum}`;
}

function resolveInvoiceNumber(row: SpreadsheetRow): number {
  return INVOICE_NUMBER_REMAPS[spreadsheetRowKey(row)] ?? row.invoiceNum;
}

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

async function ensurePayPeriod(
  prisma: Awaited<ReturnType<typeof import("../src/lib/prisma").createPrismaClient>>,
  cutoffDate: Date,
  paymentByCutoff: Map<string, Date | null>,
  cache: Map<string, string | null>,
  dryRun: boolean,
): Promise<string | null> {
  const key = cutoffDate.toISOString().slice(0, 10);
  if (cache.has(key)) return cache.get(key) ?? null;

  const existing = await findPayPeriodByCutoff(prisma, cutoffDate);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const aliasKey = CUTOFF_ALIASES[key];
  const payment = paymentByCutoff.get(key) ?? (aliasKey ? paymentByCutoff.get(aliasKey) : null) ?? null;
  const label = cutoffDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  if (dryRun) {
    cache.set(key, null);
    return null;
  }

  const created = await prisma.payPeriod.create({
    data: {
      cutoffDate,
      paymentDate: payment,
      label,
    },
  });
  cache.set(key, created.id);
  return created.id;
}

async function seedPayPeriodsFromSpreadsheet(
  prisma: Awaited<ReturnType<typeof import("../src/lib/prisma").createPrismaClient>>,
  rows: SpreadsheetRow[],
  paymentByCutoff: Map<string, Date | null>,
  cache: Map<string, string | null>,
  dryRun: boolean,
) {
  const cutoffs = [...new Set(rows.map((r) => r.cutoff?.toISOString().slice(0, 10)).filter(Boolean))] as string[];
  cutoffs.sort();
  for (const key of cutoffs) {
    await ensurePayPeriod(prisma, new Date(`${key}T00:00:00.000Z`), paymentByCutoff, cache, dryRun);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const logLines: string[] = [];

  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const workbook = XLSX.readFile(SPREADSHEET_PATH, { cellDates: true });
  const paymentByCutoff = readLniCutoffPaymentMap(workbook);

  const maria = await prisma.user.findFirst({
    where: { email: "maria@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!maria) throw new Error("Maria therapist not found");

  const spreadsheetRows = readSpreadsheetRows();
  logLine(logLines, `Read ${spreadsheetRows.length} invoice rows from spreadsheet`);
  if (dryRun) logLine(logLines, "DRY RUN — no database writes");

  const payPeriodCache = new Map<string, string | null>();
  if (!dryRun) {
    await seedPayPeriodsFromSpreadsheet(prisma, spreadsheetRows, paymentByCutoff, payPeriodCache, dryRun);
    logLine(logLines, `Seeded pay periods for ${payPeriodCache.size} spreadsheet cutoffs`);
  }

  const claims = [...new Set(spreadsheetRows.map((r) => r.claim))];
  const clients = await prisma.client.findMany({
    where: { lniClaimNumber: { in: claims } },
    select: { id: true, lniClaimNumber: true, therapistId: true, firstName: true, lastName: true },
  });
  const clientByClaim = new Map(clients.map((c) => [c.lniClaimNumber, c]));

  const existingInvoices = await prisma.invoice.findMany({
    where: { therapistId: maria.id },
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
  type ExistingInvoice = (typeof existingInvoices)[number];
  const existingByNumber = new Map(existingInvoices.map((inv) => [inv.invoiceNumber, inv]));
  const existingBySpreadsheetKey = new Map<string, ExistingInvoice>();
  for (const row of spreadsheetRows) {
    const resolvedNum = resolveInvoiceNumber(row);
    const existing = existingByNumber.get(resolvedNum);
    if (existing) {
      existingBySpreadsheetKey.set(spreadsheetRowKey(row), existing);
    }
  }

  const results: ImportResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let totalAmount = 0;
  const missingPayPeriods = new Set<string>();
  const missingClients = new Set<string>();
  const paymentCounts: Record<PaymentStatus, number> = {
    PAID: 0,
    UNPAID: 0,
    DENIED: 0,
    APPEAL_IN_PROGRESS: 0,
  };

  for (const row of spreadsheetRows) {
    const resolvedNum = resolveInvoiceNumber(row);
    const rowKey = spreadsheetRowKey(row);
    const prefix = `#${resolvedNum} (${row.invoiceNum}) ${row.claim}`;
    const warnings: string[] = [];

    if (resolvedNum !== row.invoiceNum) {
      warnings.push(`Invoice # remapped from ${row.invoiceNum}`);
    }

    const client = clientByClaim.get(row.claim);
    if (!client) {
      missingClients.add(row.claim);
      failed++;
      const error = `Client not found for claim ${row.claim}`;
      results.push({
        sheet: row.sheet,
        invoiceNum: row.invoiceNum,
        resolvedInvoiceNum: resolvedNum,
        claim: row.claim,
        amount: row.amount,
        action: "failed",
        error,
      });
      logLine(logLines, `${prefix} FAIL — ${error}`);
      continue;
    }

    if (client.therapistId && client.therapistId !== maria.id) {
      warnings.push(`Client assigned to another therapist (${client.firstName} ${client.lastName})`);
    }

    let payPeriodId: string | null = null;
    if (row.cutoff) {
      payPeriodId = await ensurePayPeriod(prisma, row.cutoff, paymentByCutoff, payPeriodCache, dryRun);
      if (!payPeriodId) {
        const key = row.cutoff.toISOString().slice(0, 10);
        missingPayPeriods.add(key);
        warnings.push(`No pay period for cutoff ${key}`);
      }
    } else {
      warnings.push("Missing cutoff date — pay period not assigned");
    }

    let lineItems: LineItem[];
    try {
      lineItems = inferLineItems(row.amount, row.dos);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        sheet: row.sheet,
        invoiceNum: row.invoiceNum,
        resolvedInvoiceNum: resolvedNum,
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
    const existing = existingByNumber.get(resolvedNum) ?? existingBySpreadsheetKey.get(rowKey);

    if (existing) {
      const sameClient = existing.clientId === client.id;
      const sameAmount = Number(existing.totalAmount) === row.amount;
      const samePayPeriod = (existing.payPeriodId ?? null) === payPeriodId;
      const samePayment =
        existing.paymentStatus === paymentStatus &&
        ((existing.lniPaidAt?.getTime() ?? null) === (lniPaidAt?.getTime() ?? null));
      if (existing.status === "BILLED" && sameClient && sameAmount && samePayPeriod && samePayment) {
        skipped++;
        paymentCounts[paymentStatus]++;
        results.push({
          sheet: row.sheet,
          invoiceNum: row.invoiceNum,
          resolvedInvoiceNum: resolvedNum,
          claim: row.claim,
          amount: row.amount,
          action: "skipped",
          paymentStatus,
          procedureCodes: lineItems.map((l) => l.procedureCode),
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
                create: lineItems.map((line, index) => ({
                  serviceDate: row.dos,
                  procedureCode: line.procedureCode,
                  amount: line.amount,
                  units: line.units,
                  sortOrder: index,
                })),
              },
            },
          });
        });
      }

      updated++;
      totalAmount += row.amount;
      paymentCounts[paymentStatus]++;
      results.push({
        sheet: row.sheet,
        invoiceNum: row.invoiceNum,
        resolvedInvoiceNum: resolvedNum,
        claim: row.claim,
        amount: row.amount,
        action: "updated",
        paymentStatus,
        procedureCodes: lineItems.map((l) => l.procedureCode),
        warnings: warnings.length ? warnings : undefined,
      });
      logLine(
        logLines,
        `${prefix} UPDATE $${row.amount.toFixed(2)} ${paymentStatus} ${lineItems.map((l) => l.procedureCode).join("+")}${warnings.length ? ` (${warnings.join("; ")})` : ""}`,
      );
      continue;
    }

    if (!dryRun) {
      const createdInvoice = await prisma.invoice.create({
        data: {
          therapistId: maria.id,
          clientId: client.id,
          invoiceNumber: resolvedNum,
          status: "BILLED",
          paymentStatus,
          lniPaidAt,
          billedAt: row.billed,
          submittedAt: row.billed,
          payPeriodId,
          totalAmount: row.amount,
          lineItems: {
            create: lineItems.map((line, index) => ({
              serviceDate: row.dos,
              procedureCode: line.procedureCode,
              amount: line.amount,
              units: line.units,
              sortOrder: index,
            })),
          },
        },
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
      existingByNumber.set(resolvedNum, createdInvoice);
      existingBySpreadsheetKey.set(rowKey, createdInvoice);
    }

    created++;
    totalAmount += row.amount;
    paymentCounts[paymentStatus]++;
    results.push({
      sheet: row.sheet,
      invoiceNum: row.invoiceNum,
      resolvedInvoiceNum: resolvedNum,
      claim: row.claim,
      amount: row.amount,
      action: "created",
      paymentStatus,
      procedureCodes: lineItems.map((l) => l.procedureCode),
      warnings: warnings.length ? warnings : undefined,
    });
    logLine(
      logLines,
      `${prefix} CREATE $${row.amount.toFixed(2)} ${paymentStatus} ${lineItems.map((l) => l.procedureCode).join("+")}${warnings.length ? ` (${warnings.join("; ")})` : ""}`,
    );
  }

  const summary = {
    at: new Date().toISOString(),
    dryRun,
    spreadsheet: SPREADSHEET_PATH,
    totalRows: spreadsheetRows.length,
    created,
    updated,
    skipped,
    failed,
    totalAmount: Math.round(totalAmount * 100) / 100,
    paymentStatus: paymentCounts,
    missingClients: [...missingClients].sort(),
    missingPayPeriods: [...missingPayPeriods].sort(),
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  writeFileSync(LOG_PATH, logLines.join("\n") + "\n");

  logLine(
    logLines,
    `\nDone: ${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed — $${totalAmount.toFixed(2)} total`,
  );
  logLine(
    logLines,
    `Payment: PAID=${paymentCounts.PAID} UNPAID=${paymentCounts.UNPAID} DENIED=${paymentCounts.DENIED}`,
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
