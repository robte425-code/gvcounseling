/**
 * Re-parse every RA PDF from Drive for Category 1 Maria invoices >800.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/rescan-ras-category1-invoices-gt800.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { writeFileSync } from "fs";
import { calendarIsoFromDate } from "../src/lib/constants";
import { getSystemDriveAccessToken } from "../src/lib/google-drive-system";
import {
  downloadLniRemittancePdf,
  listLniRemittanceAdvicePdfs,
} from "../src/lib/lni-remittance-drive";
import { parseLniRemittancePdf, type RemittanceBill } from "../src/lib/parse-lni-remittance-pdf";
import { prisma } from "../src/lib/prisma";

const TARGET_INVOICE_NUMBERS = [805, 840, 850, 861, 851, 853, 897, 906, 956];
const RESULTS_PATH = "scripts/rescan-ras-category1-invoices-gt800-results.json";

type TargetInvoice = {
  invoiceNumber: number;
  claim: string;
  client: string;
  dos: string[];
  codes: string[];
  currentDbLniStatus: string;
};

type RaHit = {
  remittanceNumber: string;
  invoiceDate: string;
  sourceFilename: string;
  section: RemittanceBill["section"];
  payable: number;
  raCodes: string[];
  raDos: string[];
  eobCodes: string[];
};

function billDos(bill: RemittanceBill): string[] {
  return [...new Set(bill.serviceLines.map((l) => l.serviceDateFrom).filter(Boolean))];
}

function billCodes(bill: RemittanceBill): string[] {
  return [...new Set(bill.serviceLines.map((l) => l.procedureCode).filter(Boolean))];
}

function billMatchesInvoice(bill: RemittanceBill, target: TargetInvoice): boolean {
  if (bill.claimNumber !== target.claim) return false;
  const dos = billDos(bill);
  return target.dos.some((d) => dos.includes(d));
}

async function main() {
  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  if (!maria) throw new Error("Maria not found");

  const targets: TargetInvoice[] = [];
  for (const n of TARGET_INVOICE_NUMBERS) {
    const inv = await prisma.invoice.findFirst({
      where: { invoiceNumber: n, therapistId: maria.id },
      include: {
        client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
        lineItems: { select: { procedureCode: true, serviceDate: true } },
      },
    });
    if (!inv) {
      targets.push({
        invoiceNumber: n,
        claim: "?",
        client: "?",
        dos: [],
        codes: [],
        currentDbLniStatus: "NOT_FOUND",
      });
      continue;
    }
    targets.push({
      invoiceNumber: n,
      claim: inv.client.lniClaimNumber,
      client: `${inv.client.firstName} ${inv.client.lastName}`,
      dos: [...new Set(inv.lineItems.map((l) => calendarIsoFromDate(l.serviceDate)))],
      codes: inv.lineItems.map((l) => l.procedureCode),
      currentDbLniStatus: inv.paymentStatus,
    });
  }

  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listLniRemittanceAdvicePdfs(accessToken);
  console.log(`Re-parsing ${files.length} RA PDF(s) from Drive...\n`);

  const paidHits = new Map<number, RaHit[]>();
  const allHits = new Map<number, RaHit[]>();
  for (const t of targets) {
    paidHits.set(t.invoiceNumber, []);
    allHits.set(t.invoiceNumber, []);
  }

  let parsedCount = 0;
  let parseErrors = 0;

  for (const file of files) {
    try {
      const buffer = await downloadLniRemittancePdf(accessToken, file);
      const parsed = await parseLniRemittancePdf(buffer);
      parsedCount++;

      for (const target of targets) {
        if (!target.claim || target.claim === "?") continue;
        for (const bill of parsed.bills) {
          if (!billMatchesInvoice(bill, target)) continue;
          const hit: RaHit = {
            remittanceNumber: parsed.remittanceNumber,
            invoiceDate: parsed.invoiceDate,
            sourceFilename: file.name,
            section: bill.section,
            payable: bill.billTotalPayable,
            raCodes: billCodes(bill),
            raDos: billDos(bill),
            eobCodes: bill.eobCodes,
          };
          allHits.get(target.invoiceNumber)!.push(hit);
          if (bill.section === "PAID") {
            paidHits.get(target.invoiceNumber)!.push(hit);
          }
        }
      }

      if (parsedCount % 10 === 0) {
        console.log(`  parsed ${parsedCount}/${files.length}...`);
      }
    } catch (err) {
      parseErrors++;
      console.error(`  failed ${file.name}:`, err instanceof Error ? err.message : err);
    }
  }

  const results = targets.map((target) => {
    const paid = paidHits.get(target.invoiceNumber) ?? [];
    const all = allHits.get(target.invoiceNumber) ?? [];
    const latest = [...all].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate)).at(-1);

    let verdict: string;
    if (paid.length > 0) {
      verdict = `PAID on ${paid.length} RA bill(s): ${paid.map((p) => p.remittanceNumber).join(", ")}`;
    } else if (all.length > 0 && latest) {
      verdict = `Not PAID — latest section ${latest.section} on RA ${latest.remittanceNumber} (${latest.invoiceDate})`;
    } else {
      verdict = "Not found on any RA PDF";
    }

    return {
      ...target,
      paidByLni: paid.length > 0,
      verdict,
      paidHits: paid,
      allRaSections: all.map((h) => ({
        ra: h.remittanceNumber,
        date: h.invoiceDate,
        section: h.section,
        codes: h.raCodes,
        dos: h.raDos,
        eobCodes: h.eobCodes,
        payable: h.payable,
      })),
      latestRaSection: latest
        ? {
            ra: latest.remittanceNumber,
            date: latest.invoiceDate,
            section: latest.section,
            eobCodes: latest.eobCodes,
          }
        : null,
    };
  });

  const output = {
    scannedAt: new Date().toISOString(),
    source: "all RA PDFs re-parsed from Google Drive",
    drivePdfCount: files.length,
    parsedCount,
    parseErrors,
    summary: {
      targets: TARGET_INVOICE_NUMBERS.length,
      paidByLni: results.filter((r) => r.paidByLni).length,
      notPaid: results.filter((r) => !r.paidByLni).length,
    },
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(output.summary, null, 2));
  console.log("\n=== Per invoice ===");
  for (const r of results) {
    console.log(
      `#${r.invoiceNumber} ${r.claim} ${r.client} | DB: ${r.currentDbLniStatus} | ${r.verdict}`,
    );
  }
  console.log(`\nWrote ${RESULTS_PATH}`);

  await prisma.$disconnect();
}

main();
