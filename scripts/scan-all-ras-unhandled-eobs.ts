/**
 * Scan all RA PDFs from Drive for EOB parse gaps and unhandled codes.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/scan-all-ras-unhandled-eobs.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { writeFileSync } from "fs";
import {
  isPreviouslyPaidDuplicateEob,
} from "../src/lib/invoice-payment-status";
import {
  parseLniRemittanceText,
  type RemittanceBill,
} from "../src/lib/parse-lni-remittance-pdf";

const RESULTS_PATH = "scripts/scan-all-ras-unhandled-eobs-results.json";

type IssueKind =
  | "denied_or_in_process_without_eob"
  | "stripped_uncatalogued_eob"
  | "service_line_eob_not_on_bill"
  | "db_missing_eob_vs_fresh_parse";

type EobIssue = {
  kind: IssueKind;
  remittanceNumber: string;
  invoiceDate: string;
  sourceFilename: string;
  claimNumber: string;
  section: RemittanceBill["section"];
  serviceDates: string[];
  rawEobCodes: string[];
  sanitizedEobCodes: string[];
  strippedEobCodes: string[];
  dbEobCodes?: string[];
  matchedInvoiceNumber?: number | null;
};

function billServiceDates(bill: RemittanceBill): string[] {
  return [...new Set(bill.serviceLines.map((line) => line.serviceDateFrom).filter(Boolean))];
}

function billKey(bill: RemittanceBill): string {
  return [
    bill.claimNumber,
    bill.section,
    billServiceDates(bill).sort().join(","),
    bill.serviceLines.map((l) => l.procedureCode).sort().join(","),
  ].join("|");
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { downloadLniRemittancePdf, listLniRemittanceAdvicePdfs } = await import(
    "../src/lib/lni-remittance-drive"
  );
  const { extractRemittancePdfText } = await import("../src/lib/pdf-text");
  const { normalizeEobCode } = await import("../src/lib/parse-lni-remittance-pdf");

  const { accessToken } = await getSystemDriveAccessToken();

  const dbRas = await prisma.remittanceAdvice.findMany({
    select: {
      remittanceNumber: true,
      warrantRegister: true,
      sourceFilename: true,
      status: true,
      lines: {
        select: {
          claimNumber: true,
          section: true,
          eobCodes: true,
          serviceLines: true,
          matchedInvoice: { select: { invoiceNumber: true } },
        },
      },
    },
  });

  const dbByFile = new Map<string, (typeof dbRas)[number]>();
  const dbByRa = new Map<string, (typeof dbRas)[number]>();
  for (const ra of dbRas) {
    if (ra.sourceFilename) dbByFile.set(ra.sourceFilename, ra);
    dbByRa.set(`${ra.remittanceNumber}:${ra.warrantRegister}`, ra);
  }

  const issues: EobIssue[] = [];
  const codeCounts = new Map<string, number>();
  const codeDescriptions = new Map<string, string>();
  const codesNeedingLogic = new Set<string>();
  const allCatalogCodes = new Set<string>();

  let parsedCount = 0;
  let parseErrors = 0;

  const files = await listLniRemittanceAdvicePdfs(accessToken);
  console.log(`Scanning ${files.length} RA PDF(s) from Drive...\n`);

  for (const file of files) {
    try {
      const buffer = await downloadLniRemittancePdf(accessToken, file);
      const extracted = await extractRemittancePdfText(buffer);
      const rawParsed = parseLniRemittanceText(extracted.text, { preserveUncataloguedEob: true });
      const sanitizedParsed = parseLniRemittanceText(extracted.text);

      for (const [code, desc] of Object.entries(rawParsed.eobCodeDescriptions)) {
        allCatalogCodes.add(code);
        if (!codeDescriptions.has(code)) codeDescriptions.set(code, desc);
      }

      const sanitizedByKey = new Map(sanitizedParsed.bills.map((bill) => [billKey(bill), bill]));
      const dbRa = dbByFile.get(file.name) ?? dbByRa.get(`${rawParsed.remittanceNumber}:${rawParsed.warrantRegister}`);

      for (const rawBill of rawParsed.bills) {
        const key = billKey(rawBill);
        const sanitizedBill = sanitizedByKey.get(key);
        const rawCodes = rawBill.eobCodes.map(normalizeEobCode);
        const sanitizedCodes = sanitizedBill?.eobCodes.map(normalizeEobCode) ?? [];
        const stripped = rawCodes.filter((code) => !sanitizedCodes.includes(code));
        const serviceLineCodes = rawBill.serviceLines
          .map((line) => line.eobCode)
          .filter((code): code is string => Boolean(code))
          .map(normalizeEobCode);

        for (const code of sanitizedCodes) {
          codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
        }

        if (
          (rawBill.section === "DENIED" || rawBill.section === "IN_PROCESS") &&
          sanitizedCodes.length === 0 &&
          rawCodes.length === 0 &&
          serviceLineCodes.length === 0
        ) {
          issues.push({
            kind: "denied_or_in_process_without_eob",
            remittanceNumber: rawParsed.remittanceNumber,
            invoiceDate: rawParsed.invoiceDate,
            sourceFilename: file.name,
            claimNumber: rawBill.claimNumber,
            section: rawBill.section,
            serviceDates: billServiceDates(rawBill),
            rawEobCodes: rawCodes,
            sanitizedEobCodes: sanitizedCodes,
            strippedEobCodes: stripped,
          });
        }

        if (stripped.length > 0) {
          issues.push({
            kind: "stripped_uncatalogued_eob",
            remittanceNumber: rawParsed.remittanceNumber,
            invoiceDate: rawParsed.invoiceDate,
            sourceFilename: file.name,
            claimNumber: rawBill.claimNumber,
            section: rawBill.section,
            serviceDates: billServiceDates(rawBill),
            rawEobCodes: rawCodes,
            sanitizedEobCodes: sanitizedCodes,
            strippedEobCodes: stripped,
          });
        }

        if (serviceLineCodes.length > 0 && sanitizedCodes.length === 0) {
          issues.push({
            kind: "service_line_eob_not_on_bill",
            remittanceNumber: rawParsed.remittanceNumber,
            invoiceDate: rawParsed.invoiceDate,
            sourceFilename: file.name,
            claimNumber: rawBill.claimNumber,
            section: rawBill.section,
            serviceDates: billServiceDates(rawBill),
            rawEobCodes: rawCodes,
            sanitizedEobCodes: sanitizedCodes,
            strippedEobCodes: serviceLineCodes,
          });
        }

        if (rawBill.section === "DENIED" && sanitizedCodes.length > 0) {
          const catalog = Object.fromEntries(codeDescriptions);
          if (!isPreviouslyPaidDuplicateEob(sanitizedCodes, catalog)) {
            for (const code of sanitizedCodes) codesNeedingLogic.add(code);
          }
        }

        if (dbRa) {
          const dbLine = dbRa.lines.find(
            (line) =>
              line.claimNumber === rawBill.claimNumber &&
              line.section === rawBill.section &&
              JSON.stringify(line.serviceLines) === JSON.stringify(rawBill.serviceLines),
          );
          if (dbLine && sanitizedCodes.length > 0 && dbLine.eobCodes.length === 0) {
            issues.push({
              kind: "db_missing_eob_vs_fresh_parse",
              remittanceNumber: rawParsed.remittanceNumber,
              invoiceDate: rawParsed.invoiceDate,
              sourceFilename: file.name,
              claimNumber: rawBill.claimNumber,
              section: rawBill.section,
              serviceDates: billServiceDates(rawBill),
              rawEobCodes: rawCodes,
              sanitizedEobCodes: sanitizedCodes,
              strippedEobCodes: stripped,
              dbEobCodes: dbLine.eobCodes,
              matchedInvoiceNumber: dbLine.matchedInvoice?.invoiceNumber ?? null,
            });
          }
        }
      }

      parsedCount++;
      if (parsedCount % 15 === 0) {
        console.log(`  parsed ${parsedCount}/${files.length}...`);
      }
    } catch (error) {
      parseErrors++;
      console.error(`  failed ${file.name}:`, error instanceof Error ? error.message : error);
    }
  }

  const handledLogicCodes = ["309", "101"];
  const unhandledLogicCodes = [...codesNeedingLogic]
    .filter((code) => !handledLogicCodes.includes(code))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const byKind = {
    denied_or_in_process_without_eob: issues.filter((i) => i.kind === "denied_or_in_process_without_eob"),
    stripped_uncatalogued_eob: issues.filter((i) => i.kind === "stripped_uncatalogued_eob"),
    service_line_eob_not_on_bill: issues.filter((i) => i.kind === "service_line_eob_not_on_bill"),
    db_missing_eob_vs_fresh_parse: issues.filter((i) => i.kind === "db_missing_eob_vs_fresh_parse"),
  };

  const output = {
    scannedAt: new Date().toISOString(),
    drivePdfCount: files.length,
    parsedCount,
    parseErrors,
    uniqueEobCodesOnBills: [...codeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({
        code,
        count,
        description: codeDescriptions.get(code) ?? null,
        handledByPaymentLogic: handledLogicCodes.includes(code),
      })),
    catalogCodesWithoutBills: [...allCatalogCodes].filter((code) => !codeCounts.has(code)).sort(),
    unhandledPaymentLogicCodes: unhandledLogicCodes.map((code) => ({
      code,
      description: codeDescriptions.get(code) ?? null,
      billCount: codeCounts.get(code) ?? 0,
    })),
    issueCounts: {
      denied_or_in_process_without_eob: byKind.denied_or_in_process_without_eob.length,
      stripped_uncatalogued_eob: byKind.stripped_uncatalogued_eob.length,
      service_line_eob_not_on_bill: byKind.service_line_eob_not_on_bill.length,
      db_missing_eob_vs_fresh_parse: byKind.db_missing_eob_vs_fresh_parse.length,
      total: issues.length,
    },
    issues: byKind,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));

  console.log("\n=== EOB scan summary ===");
  console.log(JSON.stringify(output.issueCounts, null, 2));
  console.log("\nTop EOB codes on bills:");
  for (const row of output.uniqueEobCodesOnBills.slice(0, 15)) {
    console.log(`  ${row.code}: ${row.count}x — ${row.description?.slice(0, 60) ?? "(no desc)"}`);
  }
  if (output.unhandledPaymentLogicCodes.length) {
    console.log("\nDenied EOB codes without special payment logic:");
    for (const row of output.unhandledPaymentLogicCodes) {
      console.log(`  ${row.code}: ${row.billCount}x — ${row.description?.slice(0, 80) ?? ""}`);
    }
  }
  if (byKind.db_missing_eob_vs_fresh_parse.length) {
    console.log(`\nDB lines missing EOB vs fresh parse: ${byKind.db_missing_eob_vs_fresh_parse.length}`);
    for (const issue of byKind.db_missing_eob_vs_fresh_parse.slice(0, 10)) {
      console.log(
        `  RA ${issue.remittanceNumber} ${issue.claimNumber} inv #${issue.matchedInvoiceNumber ?? "?"} -> ${issue.sanitizedEobCodes.join(",")}`,
      );
    }
  }
  console.log(`\nFull results: ${RESULTS_PATH}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
