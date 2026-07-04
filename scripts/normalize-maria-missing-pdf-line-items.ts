/**
 * Normalize line items for Maria invoices with no Drive PDF, using DB/spreadsheet totals.
 * Usage: npx tsx scripts/normalize-maria-missing-pdf-line-items.ts [--dry-run]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import { MARIA_FEE_SCHEDULES } from "../src/lib/parse-maria-invoice-pdf";
import { resolveFeeAmount, type FeeScheduleRow } from "../src/lib/procedure-fee-schedule";

const RESULTS_PATH = "scripts/normalize-maria-missing-pdf-line-items-results.json";
const LOG_PATH = "scripts/normalize-maria-missing-pdf-line-items-run.log";
const RESCAN_RESULTS_PATH = "scripts/rescan-maria-invoice-line-items-results.json";

const PHONE_CODE_BY_AMOUNT: Record<number, string> = {
  12: "98966",
  22.2: "98967",
  30.29: "98968",
};

const PARTIAL_BHI_AMOUNTS = new Set([48.75, 52.5, 56.25, 57.75]);

type LineItem = { procedureCode: string; amount: number; units: number };

type Result = {
  invoiceNumber: number;
  claim: string;
  action: "updated" | "skipped" | "failed";
  before?: string;
  after?: string;
  error?: string;
};

function log(lines: string[], message: string) {
  lines.push(message);
  console.log(message);
}

function amountsClose(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance;
}

function buildMariaFeeSchedule(serviceDate: Date): FeeScheduleRow[] {
  const day = serviceDate.toISOString().slice(0, 10);
  let active = MARIA_FEE_SCHEDULES[0]!;
  for (const schedule of MARIA_FEE_SCHEDULES) {
    if (day >= schedule.effectiveFrom) active = schedule;
  }
  return Object.entries(active.fees).map(([procedureCode, amount]) => ({
    procedureCode,
    amount,
    effectiveFrom: new Date(`${active.effectiveFrom}T00:00:00.000Z`),
    effectiveTo: null,
  }));
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

  for (const schedule of MARIA_FEE_SCHEDULES) {
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

  for (const schedule of MARIA_FEE_SCHEDULES) {
    const s58 = schedule.fees["96158"];
    const s59 = schedule.fees["96159"];
    if (s58 != null && s59 != null && amountsClose(s58 + s59, amount)) {
      return [
        { procedureCode: "96158", amount: s58, units: 1 },
        { procedureCode: "96159", amount: s59, units: 1 },
      ];
    }
  }

  // 96158 + 2×96159 (75% partial BHI billed as full session split)
  for (const schedule of MARIA_FEE_SCHEDULES) {
    const s58 = schedule.fees["96158"];
    const s59 = schedule.fees["96159"];
    if (s58 != null && s59 != null && amountsClose(s58 + 2 * s59, amount)) {
      return [
        { procedureCode: "96158", amount: s58, units: 1 },
        { procedureCode: "96159", amount: s59, units: 1 },
        { procedureCode: "96159", amount: s59, units: 1 },
      ];
    }
  }

  if (amount === 33.21) return [{ procedureCode: "9919M", amount, units: 1 }];
  if (amount === 22.44) return [{ procedureCode: "98967", amount, units: 1 }];
  if (amount === 45) return [{ procedureCode: "90832", amount, units: 1 }];
  if (amount === 32.5) return [{ procedureCode: "96158", amount, units: 1 }];

  throw new Error(
    `Unknown amount $${amount.toFixed(2)} for DOS ${serviceDate.toISOString().slice(0, 10)}`,
  );
}

function formatLines(items: { procedureCode: string; amount: number }[]): string {
  return items.map((i) => `${i.procedureCode}=$${i.amount.toFixed(2)}`).join(", ");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const logLines: string[] = [];

  const { readFileSync, existsSync } = await import("fs");
  if (!existsSync(RESCAN_RESULTS_PATH)) {
    throw new Error(`Missing ${RESCAN_RESULTS_PATH} — run rescan first`);
  }
  const rescan = JSON.parse(readFileSync(RESCAN_RESULTS_PATH, "utf8")) as {
    results: { invoiceNumber: number; claim: string; action: string }[];
  };
  const missingNums = rescan.results
    .filter((r) => r.action === "missing_pdf")
    .map((r) => r.invoiceNumber);

  const { prisma } = await import("../src/lib/prisma");
  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  if (!maria) throw new Error("Maria therapist not found");

  log(logLines, dryRun ? "DRY RUN" : "LIVE RUN");
  log(logLines, `Normalizing ${missingNums.length} invoices with no Drive PDF…`);

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: maria.id, invoiceNumber: { in: missingNums } },
    include: {
      client: { select: { lniClaimNumber: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const results: Result[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const invoice of invoices) {
    const prefix = `#${invoice.invoiceNumber} ${invoice.client.lniClaimNumber}`;
    const serviceDate = invoice.lineItems[0]?.serviceDate;
    if (!serviceDate) {
      failed++;
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "failed",
        error: "No service date on line items",
      });
      log(logLines, `${prefix} FAILED — no service date`);
      continue;
    }

    const amount = Math.round(Number(invoice.totalAmount) * 100) / 100;
    const before = formatLines(
      invoice.lineItems.map((l) => ({
        procedureCode: l.procedureCode,
        amount: Number(l.amount),
      })),
    );

    try {
      const inferred = inferLineItems(amount, serviceDate);
      const after = formatLines(inferred);

      if (before === after) {
        skipped++;
        results.push({
          invoiceNumber: invoice.invoiceNumber,
          claim: invoice.client.lniClaimNumber,
          action: "skipped",
          before,
          after,
        });
        log(logLines, `${prefix} SKIPPED (already correct) ${after}`);
        continue;
      }

      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              lineItems: {
                create: inferred.map((item, index) => ({
                  serviceDate,
                  procedureCode: item.procedureCode,
                  amount: item.amount,
                  units: item.units,
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
      });
      log(logLines, `${prefix} UPDATE $${amount.toFixed(2)} ${before} → ${after}`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        invoiceNumber: invoice.invoiceNumber,
        claim: invoice.client.lniClaimNumber,
        action: "failed",
        before,
        error: message,
      });
      log(logLines, `${prefix} FAILED — ${message}`);
    }
  }

  const summary = {
    at: new Date().toISOString(),
    dryRun,
    targetCount: missingNums.length,
    updated,
    skipped,
    failed,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  writeFileSync(LOG_PATH, logLines.join("\n"));

  log(
    logLines,
    `\nDone: ${updated} updated, ${skipped} already correct, ${failed} failed`,
  );
  log(logLines, `Results: ${RESULTS_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
