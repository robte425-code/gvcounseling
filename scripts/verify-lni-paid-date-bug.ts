/**
 * Verify no invoice is marked PAID solely because of an LNI Paid warrant date.
 * Usage: npx tsx scripts/verify-lni-paid-date-bug.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import * as XLSX from "xlsx";
import { inferPaymentStatusFromSpreadsheet } from "../src/lib/invoice-payment-status";
import { parseLniDate } from "../src/lib/lni-pay-periods";

const MARIA_SPREADSHEET = "/Users/ghim/Downloads/Maria_ Client Billing Status.xlsx";
const STEVEN_SPREADSHEET = "/Users/ghim/Downloads/Steven_ Client Billing Status (1).xlsx";

const MARIA_INVOICE_REMAPS: Record<string, number> = {
  "BL77528:358": 357,
  "BL77059:531": 532,
  "BL20510:670": 936,
  "AU51037:93": 1015,
};

type SheetRow = {
  therapist: "maria" | "steven";
  invoiceNum: number;
  claim: string;
  lniPaidRaw: unknown;
  lniPayment: string;
  expectedStatus: ReturnType<typeof inferPaymentStatusFromSpreadsheet>["paymentStatus"];
  /** Old import bug: any LNI Paid date without Verified/Denied in LNI Payment → PAID */
  oldBugWouldMarkPaid: boolean;
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
  if (!text || text.startsWith("$") || /need to add/i.test(text)) return null;
  const lni = parseLniDate(text.replace(/\//g, "-"));
  if (lni) return lni;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readRows(
  path: string,
  sheets: string[],
  therapist: "maria" | "steven",
): SheetRow[] {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const rows: SheetRow[] = [];

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
      const invoiceNum = Number(row?.[3]);
      const claim = String(row?.[5] ?? "")
        .trim()
        .toUpperCase();
      if (!Number.isInteger(invoiceNum) || !claim) continue;

      const resolved =
        therapist === "maria"
          ? (MARIA_INVOICE_REMAPS[`${claim}:${invoiceNum}`] ?? invoiceNum)
          : invoiceNum;
      const lniPaidRaw = row?.[11];
      const lniPaid = parseExcelDate(lniPaidRaw);
      const lniPayment = String(row?.[14] ?? "").trim();
      const expected = inferPaymentStatusFromSpreadsheet(lniPaid, lniPayment);
      const oldBugWouldMarkPaid =
        Boolean(lniPaid) &&
        !/^verified/i.test(lniPayment) &&
        lniPayment !== "Verified on 12/24/24 bill" &&
        !/denied/i.test(lniPayment);

      rows.push({
        therapist,
        invoiceNum: resolved,
        claim,
        lniPaidRaw,
        lniPayment: lniPayment || "(blank)",
        expectedStatus: expected.paymentStatus,
        oldBugWouldMarkPaid,
      });
    }
  }

  return rows;
}

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const sheetRows = [
    ...readRows(MARIA_SPREADSHEET, ["Invoiced 2024", "Invoiced 2025", "Invoiced 2026"], "maria"),
    ...readRows(STEVEN_SPREADSHEET, ["Invoiced 2025", "Invoiced 2026"], "steven"),
  ];

  const therapists = await prisma.user.findMany({
    where: { email: { in: ["maria@gvcounseling.com", "steven@gvcounseling.com"] } },
    select: { id: true, email: true },
  });
  const idByEmail = Object.fromEntries(therapists.map((t) => [t.email, t.id]));

  const invoices = await prisma.invoice.findMany({
    where: { therapistId: { in: therapists.map((t) => t.id) } },
    select: {
      invoiceNumber: true,
      therapistId: true,
      paymentStatus: true,
      lniPaidAt: true,
      client: { select: { lniClaimNumber: true } },
    },
  });
  const dbByKey = new Map(invoices.map((inv) => [`${inv.therapistId}:${inv.invoiceNumber}`, inv]));

  const mismatches: (SheetRow & { actualStatus: string | null })[] = [];
  const oldBugRows: (SheetRow & { actualStatus: string | null })[] = [];

  for (const row of sheetRows) {
    const therapistId =
      row.therapist === "maria"
        ? idByEmail["maria@gvcounseling.com"]
        : idByEmail["steven@gvcounseling.com"];
    const inv = dbByKey.get(`${therapistId}:${row.invoiceNum}`);
    if (!inv) continue;

    if (inv.paymentStatus !== row.expectedStatus) {
      mismatches.push({ ...row, actualStatus: inv.paymentStatus });
    }

    if (row.oldBugWouldMarkPaid) {
      oldBugRows.push({ ...row, actualStatus: inv.paymentStatus });
    }
  }

  const sheetKeys = new Set(
    sheetRows.map((r) => {
      const therapistId =
        r.therapist === "maria"
          ? idByEmail["maria@gvcounseling.com"]
          : idByEmail["steven@gvcounseling.com"];
      return `${therapistId}:${r.invoiceNum}`;
    }),
  );
  const dbOnly = invoices.filter((inv) => !sheetKeys.has(`${inv.therapistId}:${inv.invoiceNumber}`));

  console.log("Full spreadsheet verification (Maria + Steven)");
  console.log(`  Spreadsheet rows:     ${sheetRows.length}`);
  console.log(`  Matching DB status:   ${sheetRows.length - mismatches.length}`);
  console.log(`  Mismatches:           ${mismatches.length}`);
  if (mismatches.length) {
    console.log("\nMismatches:");
    console.table(mismatches);
  }

  console.log("\nOld bug pattern: LNI Paid has date, LNI Payment is NOT Verified/Denied");
  console.log(`  Rows in spreadsheets: ${oldBugRows.length}`);
  if (oldBugRows.length) {
    console.table(
      oldBugRows.map((r) => ({
        therapist: r.therapist,
        invoice: r.invoiceNum,
        claim: r.claim,
        lniPaid: r.lniPaidRaw,
        lniPayment: r.lniPayment,
        expected: r.expectedStatus,
        actual: r.actualStatus,
      })),
    );
  }

  const wronglyPaidByBug = oldBugRows.filter(
    (r) => r.actualStatus === "PAID" && r.expectedStatus === "UNPAID",
  );
  console.log(`  Still wrongly PAID:   ${wronglyPaidByBug.length}`);

  console.log("\nDB invoices not in spreadsheet:");
  console.table(
    dbOnly.map((i) => ({
      therapist: i.therapistId === idByEmail["maria@gvcounseling.com"] ? "maria" : "steven",
      invoice: i.invoiceNumber,
      claim: i.client.lniClaimNumber,
      status: i.paymentStatus,
    })),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
