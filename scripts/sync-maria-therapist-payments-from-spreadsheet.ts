/**
 * Mark Maria invoices as therapist-paid when spreadsheet LNI Payment = Verified.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/sync-maria-therapist-payments-from-spreadsheet.ts [--dry-run]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";
import { computeTherapistAmountForInvoice } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

const SPREADSHEET_PATH = "/Users/ghim/Downloads/Maria_ Client Billing Status.xlsx";
const SHEETS = ["Invoiced 2024", "Invoiced 2025", "Invoiced 2026"] as const;
const RESULTS_PATH = "scripts/sync-maria-therapist-payments-results.json";

const HISTORICAL_REMITTANCE_NUMBER = "MARIA-SPREADSHEET";
const HISTORICAL_WARRANT_REGISTER = "THERAPIST-VERIFIED";

/** Spreadsheet claim:invoiceNum pairs that collide with another row's invoice #. */
const INVOICE_NUMBER_REMAPS: Record<string, number> = {
  "BL77528:358": 357,
  "BL77059:531": 532,
  "BL20510:670": 936,
  "AU51037:93": 1015,
};

type VerifiedRow = {
  sheet: string;
  invoiceNum: number;
  resolvedInvoiceNum: number;
  claim: string;
};

function parseClaim(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function parseInvoiceNum(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function readVerifiedRows(): VerifiedRow[] {
  const workbook = XLSX.readFile(SPREADSHEET_PATH, { cellDates: true });
  const rows: VerifiedRow[] = [];

  for (const sheetName of SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    for (const row of raw) {
      const lniPayment = String(row["LNI Payment"] ?? "")
        .trim()
        .toLowerCase();
      if (lniPayment !== "verified") continue;

      const invoiceNum = parseInvoiceNum(row["Invoice #"]);
      const claim = parseClaim(row["Claim #"]);
      if (!invoiceNum || !claim) continue;

      const key = `${claim}:${invoiceNum}`;
      const resolvedInvoiceNum = INVOICE_NUMBER_REMAPS[key] ?? invoiceNum;
      rows.push({ sheet: sheetName, invoiceNum, resolvedInvoiceNum, claim });
    }
  }

  return rows;
}

async function ensureHistoricalPayRun(adminId: string, mariaId: string, dryRun: boolean) {
  const existing = await prisma.remittanceAdvice.findUnique({
    where: {
      remittanceNumber_warrantRegister: {
        remittanceNumber: HISTORICAL_REMITTANCE_NUMBER,
        warrantRegister: HISTORICAL_WARRANT_REGISTER,
      },
    },
    include: {
      payRun: {
        include: {
          payouts: {
            where: { therapistId: mariaId },
            take: 1,
          },
        },
      },
    },
  });

  if (existing?.payRun?.payouts[0]) {
    return {
      payRunId: existing.payRun.id,
      payoutId: existing.payRun.payouts[0].id,
      created: false,
    };
  }

  if (dryRun) {
    return { payRunId: null, payoutId: null, created: false };
  }

  const remittance = existing
    ? existing
    : await prisma.remittanceAdvice.create({
        data: {
          remittanceNumber: HISTORICAL_REMITTANCE_NUMBER,
          warrantRegister: HISTORICAL_WARRANT_REGISTER,
          invoiceDate: new Date("2024-01-01T00:00:00.000Z"),
          payeeNumber: "0000000",
          payeeName: "Maria spreadsheet historical therapist payments",
          totalPaid: 0,
          status: "APPLIED",
          appliedAt: new Date(),
          sourceFilename: "Maria_ Client Billing Status.xlsx",
          importedById: adminId,
        },
      });

  const payRun =
    existing?.payRun ??
    (await prisma.therapistPayRun.create({
      data: {
        remittanceAdviceId: remittance.id,
        status: "FINALIZED",
        finalizedAt: new Date(),
      },
    }));

  let payout = await prisma.therapistPayRunPayout.findUnique({
    where: { payRunId_therapistId: { payRunId: payRun.id, therapistId: mariaId } },
  });

  if (!payout) {
    payout = await prisma.therapistPayRunPayout.create({
      data: {
        payRunId: payRun.id,
        therapistId: mariaId,
        therapistAmount: 0,
        lniPaidAmount: 0,
        invoiceCount: 0,
      },
    });
  }

  return { payRunId: payRun.id, payoutId: payout.id, created: true };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const verifiedRows = readVerifiedRows();
  const uniqueByInvoice = new Map<number, VerifiedRow>();
  for (const row of verifiedRows) {
    uniqueByInvoice.set(row.resolvedInvoiceNum, row);
  }

  const maria = await prisma.user.findFirst({
    where: { email: "maria@gvcounseling.com" },
  });
  if (!maria) throw new Error("Maria therapist not found");

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("Admin user not found");

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: maria.id },
    include: {
      client: { select: { lniClaimNumber: true } },
      lineItems: { select: { procedureCode: true, serviceDate: true, units: true } },
      _count: { select: { payRunLines: true } },
    },
  });
  const invoiceByNumber = new Map(invoices.map((inv) => [inv.invoiceNumber, inv]));

  const feeRows = await prisma.therapistProcedureCodeFee.findMany({
    where: { therapistId: maria.id },
  });

  const results: Array<{
    invoiceNumber: number;
    claim: string;
    action: "already_paid" | "created" | "missing" | "failed";
    error?: string;
  }> = [];

  const toCreate: Array<{
    invoiceId: string;
    invoiceNumber: number;
    claim: string;
    lniPaidAmount: number;
    therapistAmount: number;
  }> = [];

  for (const row of uniqueByInvoice.values()) {
    const invoice = invoiceByNumber.get(row.resolvedInvoiceNum);
    if (!invoice) {
      results.push({
        invoiceNumber: row.resolvedInvoiceNum,
        claim: row.claim,
        action: "missing",
      });
      continue;
    }

    if (invoice._count.payRunLines > 0) {
      results.push({
        invoiceNumber: row.resolvedInvoiceNum,
        claim: row.claim,
        action: "already_paid",
      });
      continue;
    }

    try {
      const therapistAmount = await computeTherapistAmountForInvoice(invoice, feeRows);
      const lniPaidAmount = Number(invoice.totalAmount);
      toCreate.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        claim: row.claim,
        lniPaidAmount,
        therapistAmount,
      });
    } catch (error) {
      results.push({
        invoiceNumber: row.resolvedInvoiceNum,
        claim: row.claim,
        action: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (dryRun) {
    console.log("DRY RUN");
    console.log({
      verifiedRows: verifiedRows.length,
      uniqueInvoices: uniqueByInvoice.size,
      alreadyPaid: results.filter((r) => r.action === "already_paid").length,
      missing: results.filter((r) => r.action === "missing").length,
      failed: results.filter((r) => r.action === "failed").length,
      wouldCreate: toCreate.length,
    });
    writeFileSync(
      RESULTS_PATH,
      JSON.stringify({ dryRun: true, results, toCreate }, null, 2),
    );
    await prisma.$disconnect();
    return;
  }

  if (toCreate.length > 0) {
    const { payoutId } = await ensureHistoricalPayRun(admin.id, maria.id, false);

    let therapistTotal = 0;
    let lniTotal = 0;

    for (const line of toCreate) {
      await prisma.therapistPayRunLine.create({
        data: {
          payoutId: payoutId!,
          invoiceId: line.invoiceId,
          lniPaidAmount: line.lniPaidAmount,
          therapistAmount: line.therapistAmount,
        },
      });
      therapistTotal += line.therapistAmount;
      lniTotal += line.lniPaidAmount;
      results.push({
        invoiceNumber: line.invoiceNumber,
        claim: line.claim,
        action: "created",
      });
    }

    const mariaPayout = await prisma.therapistPayRunPayout.findUniqueOrThrow({
      where: { id: payoutId! },
      include: { _count: { select: { lines: true } } },
    });

    const allLines = await prisma.therapistPayRunLine.findMany({
      where: { payoutId: payoutId! },
      select: { therapistAmount: true, lniPaidAmount: true },
    });

    await prisma.therapistPayRunPayout.update({
      where: { id: payoutId! },
      data: {
        invoiceCount: mariaPayout._count.lines,
        therapistAmount: allLines.reduce((sum, l) => sum + Number(l.therapistAmount), 0),
        lniPaidAmount: allLines.reduce((sum, l) => sum + Number(l.lniPaidAmount), 0),
      },
    });

    console.log(`Created ${toCreate.length} pay run line(s); totals this run: therapist $${therapistTotal.toFixed(2)}, LNI $${lniTotal.toFixed(2)}`);
  }

  const summary = {
    dryRun: false,
    verifiedRows: verifiedRows.length,
    uniqueInvoices: uniqueByInvoice.size,
    alreadyPaid: results.filter((r) => r.action === "already_paid").length,
    created: results.filter((r) => r.action === "created").length,
    missing: results.filter((r) => r.action === "missing").length,
    failed: results.filter((r) => r.action === "failed").length,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  console.log(summary);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
