#!/usr/bin/env tsx
/**
 * Finalize draft therapist pay runs for historical invoices (service date ≤ cutoff).
 * Same scope as migration 20250717120000_finalize_historical_therapist_pay_runs.
 *
 * Usage:
 *   set -a && source .env.smoke.local && set +a
 *   npx tsx scripts/finalize-historical-therapist-pay.ts --dry-run
 *   npx tsx scripts/finalize-historical-therapist-pay.ts
 */

import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import path from "path";

function loadSmokeEnv() {
  const file = path.join(process.cwd(), ".env.smoke.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadSmokeEnv();

const CUTOFF_EXCLUSIVE = new Date(Date.UTC(2026, 6, 3)); // 2026-07-03 — includes all of July 2
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");

  const draftRuns = await prisma.therapistPayRun.findMany({
    where: {
      status: "DRAFT",
      remittanceAdvice: { status: "APPLIED" },
    },
    include: {
      remittanceAdvice: { select: { id: true, remittanceNumber: true, invoiceDate: true } },
      payouts: {
        include: {
          lines: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  lineItems: { select: { serviceDate: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const toFinalize = draftRuns.filter((run) => {
    const invoices = run.payouts.flatMap((payout) => payout.lines.map((line) => line.invoice));
    if (invoices.length === 0) return false;
    return invoices.every((invoice) => {
      const dates = invoice.lineItems.map((line) => line.serviceDate.getTime());
      if (dates.length === 0) return false;
      return Math.max(...dates) < CUTOFF_EXCLUSIVE.getTime();
    });
  });

  console.log(
    `${dryRun ? "[dry-run] " : ""}Draft applied pay runs: ${draftRuns.length}; historical (≤ 2026-07-02): ${toFinalize.length}`,
  );

  for (const run of toFinalize) {
    const invoiceNumbers = [
      ...new Set(
        run.payouts.flatMap((payout) =>
          payout.lines.map((line) => line.invoice.invoiceNumber),
        ),
      ),
    ].sort((a, b) => a - b);
    console.log(
      `  RA ${run.remittanceAdvice.remittanceNumber} → invoices ${invoiceNumbers.join(", ")}`,
    );
  }

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  if (toFinalize.length === 0) {
    console.log("Nothing to finalize.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.therapistPayRun.updateMany({
    where: { id: { in: toFinalize.map((run) => run.id) }, status: "DRAFT" },
    data: { status: "FINALIZED", finalizedAt: new Date() },
  });

  console.log(`Finalized ${result.count} therapist pay run(s). No emails sent.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
