/**
 * Audit psychotherapy invoices against remittance advices; optionally re-import affected RAs.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/audit-psychotherapy-invoices-vs-ras.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import { calendarIsoFromDate } from "../src/lib/constants";
import { getSystemDriveAccessToken } from "../src/lib/google-drive-system";
import {
  downloadLniRemittancePdf,
  listLniRemittanceAdvicePdfs,
} from "../src/lib/lni-remittance-drive";
import { matchRemittanceBills } from "../src/lib/match-remittance-to-invoices";
import {
  applyRemittanceAdvice,
  importRemittancePreview,
  reconcileAllInvoicePaymentStatuses,
  revertAppliedRemittance,
} from "../src/lib/remittance-advice";
import { parseLniRemittancePdf, type RemittanceBill } from "../src/lib/parse-lni-remittance-pdf";
import { prisma } from "../src/lib/prisma";

const PSYCHOTHERAPY_CODES = new Set(["90832", "90834", "90837"]);
const RESULTS_PATH = "scripts/audit-psychotherapy-invoices-results.json";

function billHasPsychotherapy(bill: RemittanceBill): boolean {
  return bill.serviceLines.some((line) => PSYCHOTHERAPY_CODES.has(line.procedureCode));
}

function billPsychKey(bill: RemittanceBill): string {
  const dates = [...new Set(bill.serviceLines.map((l) => l.serviceDateFrom))].sort().join(",");
  const codes = [...new Set(bill.serviceLines.map((l) => l.procedureCode))].sort().join(",");
  return `${bill.claimNumber}|${dates}|${codes}|${bill.section}|${bill.billTotalPayable}`;
}

function invoicePsychKeys(invoice: {
  client: { lniClaimNumber: string };
  lineItems: Array<{ procedureCode: string; serviceDate: Date }>;
}): string[] {
  const psychLines = invoice.lineItems.filter((li) => PSYCHOTHERAPY_CODES.has(li.procedureCode));
  if (!psychLines.length) return [];
  const dates = [...new Set(psychLines.map((li) => calendarIsoFromDate(li.serviceDate)))].sort().join(",");
  const codes = [...new Set(psychLines.map((li) => li.procedureCode))].sort().join(",");
  return [`${invoice.client.lniClaimNumber}|${dates}|${codes}`];
}

async function reimportAppliedRemittance(options: {
  remittanceNumber: string;
  sourceFilename: string | null;
  file: { id: string; name: string; mimeType: string };
  accessToken: string;
  adminId: string;
}) {
  const existing = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber: options.remittanceNumber },
    select: { id: true, status: true },
  });

  if (existing?.status === "APPLIED") {
    await revertAppliedRemittance(existing.id);
  } else if (existing) {
    await prisma.remittanceAdvice.delete({ where: { id: existing.id } });
  }

  const buffer = await downloadLniRemittancePdf(options.accessToken, options.file);
  const parsed = await parseLniRemittancePdf(buffer);
  let matches = await matchRemittanceBills(parsed.bills);

  // For psychotherapy bills, allow claim+DOS match when procedure code differs (90834 vs 90837).
  const psychInvoices = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      lineItems: { some: { procedureCode: { in: [...PSYCHOTHERAPY_CODES] } } },
    },
    include: {
      client: { select: { lniClaimNumber: true } },
      lineItems: { select: { procedureCode: true, serviceDate: true } },
    },
  });

  const invoiceByClaimDate = new Map<string, string>();
  for (const invoice of psychInvoices) {
    for (const line of invoice.lineItems) {
      if (!PSYCHOTHERAPY_CODES.has(line.procedureCode)) continue;
      const key = `${invoice.client.lniClaimNumber}|${calendarIsoFromDate(line.serviceDate)}`;
      invoiceByClaimDate.set(key, invoice.id);
    }
  }

  for (const match of matches) {
    if (!billHasPsychotherapy(match.bill) || match.matchedInvoiceId) continue;
    for (const line of match.bill.serviceLines) {
      if (!PSYCHOTHERAPY_CODES.has(line.procedureCode)) continue;
      const key = `${match.bill.claimNumber}|${line.serviceDateFrom}`;
      const invoiceId = invoiceByClaimDate.get(key);
      if (invoiceId) {
        match.matchedInvoiceId = invoiceId;
        match.matchNote =
          match.matchNote ??
          "Psychotherapy match by claim and service date (procedure code may differ on RA)";
        break;
      }
    }
  }

  const { remittanceAdviceId } = await importRemittancePreview({
    parsed,
    matches,
    sourceFilename: options.file.name,
    importedById: options.adminId,
  });

  const unmatchedLines = await prisma.remittanceAdviceLine.findMany({
    where: { remittanceAdviceId, matchedInvoiceId: null, supersededAt: null },
  });
  for (const line of unmatchedLines) {
    const serviceLines = line.serviceLines as Array<{ serviceDateFrom?: string }>;
    const dates = serviceLines
      .map((sl) => sl.serviceDateFrom)
      .filter((d): d is string => Boolean(d));
    const hasInvoice =
      dates.length > 0
        ? (await prisma.invoice.count({
            where: {
              status: "BILLED",
              client: { lniClaimNumber: line.claimNumber },
              lineItems: {
                some: {
                  serviceDate: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
                },
              },
            },
          })) > 0
        : (await prisma.invoice.count({
            where: {
              status: "BILLED",
              client: { lniClaimNumber: line.claimNumber },
            },
          })) > 0;
    if (!hasInvoice) {
      await prisma.remittanceAdviceLine.update({
        where: { id: line.id },
        data: {
          supersededAt: new Date(),
          supersedeNote: "Unmatched — no billed invoice for claim/DOS",
        },
      });
    }
  }

  await applyRemittanceAdvice(remittanceAdviceId);

  return {
    remittanceNumber: options.remittanceNumber,
    billCount: parsed.bills.length,
    psychBillCount: parsed.bills.filter(billHasPsychotherapy).length,
  };
}

async function main() {
  const fix = process.argv.includes("--fix");

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found.");

  const psychInvoices = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      lineItems: { some: { procedureCode: { in: [...PSYCHOTHERAPY_CODES] } } },
    },
    include: {
      client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
      therapist: { select: { email: true } },
      lineItems: { select: { procedureCode: true, serviceDate: true, amount: true } },
      remittanceLines: {
        where: { supersededAt: null, remittanceAdvice: { status: "APPLIED" } },
        include: {
          remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
        },
      },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const appliedRas = await prisma.remittanceAdvice.findMany({
    where: { status: "APPLIED" },
    select: {
      id: true,
      remittanceNumber: true,
      sourceFilename: true,
      invoiceDate: true,
      lines: {
        where: { supersededAt: null },
        select: {
          claimNumber: true,
          section: true,
          billTotalPayable: true,
          serviceLines: true,
          matchedInvoiceId: true,
        },
      },
    },
    orderBy: { invoiceDate: "asc" },
  });

  const { accessToken } = await getSystemDriveAccessToken();
  const driveFiles = await listLniRemittanceAdvicePdfs(accessToken);
  const fileByName = new Map(driveFiles.map((f) => [f.name, f]));

  const raGaps: Array<{
    remittanceNumber: string;
    sourceFilename: string | null;
    dbBills: number;
    parsedBills: number;
    dbPsych: number;
    parsedPsych: number;
    missingPsychKeys: string[];
  }> = [];

  console.log(`Scanning ${appliedRas.length} applied RA(s) from Drive...`);
  for (const ra of appliedRas) {
    const file =
      (ra.sourceFilename ? fileByName.get(ra.sourceFilename) : undefined) ??
      driveFiles.find((f) => f.name.includes(ra.remittanceNumber));
    if (!file) {
      console.warn(`  skip RA ${ra.remittanceNumber}: PDF not found on Drive`);
      continue;
    }

    const buffer = await downloadLniRemittancePdf(accessToken, file);
    const parsed = await parseLniRemittancePdf(buffer);
    const parsedPsychBills = parsed.bills.filter(billHasPsychotherapy);

    const dbPsychLines = ra.lines.filter((line) =>
      (line.serviceLines as Array<{ procedureCode?: string }>).some((sl) =>
        PSYCHOTHERAPY_CODES.has(sl.procedureCode ?? ""),
      ),
    );

    const parsedPsychKeys = new Set(parsedPsychBills.map(billPsychKey));
    const dbPsychKeys = new Set(
      dbPsychLines.map((line) => {
        const sl = line.serviceLines as Array<{
          procedureCode: string;
          serviceDateFrom: string;
        }>;
        const bill: RemittanceBill = {
          section: line.section,
          claimNumber: line.claimNumber,
          patientName: "",
          icn: "",
          serviceProviderId: "",
          serviceProviderNpi: "",
          serviceProviderName: "",
          serviceLines: sl,
          billTotalBilled: 0,
          billTotalAllowed: 0,
          billTotalNonCovered: 0,
          billTotalPayable: Number(line.billTotalPayable),
          eobCodes: [],
        };
        return billPsychKey(bill);
      }),
    );

    const missingPsychKeys = [...parsedPsychKeys].filter((k) => !dbPsychKeys.has(k));
    if (parsed.bills.length !== ra.lines.length || missingPsychKeys.length > 0) {
      raGaps.push({
        remittanceNumber: ra.remittanceNumber,
        sourceFilename: ra.sourceFilename,
        dbBills: ra.lines.length,
        parsedBills: parsed.bills.length,
        dbPsych: dbPsychLines.length,
        parsedPsych: parsedPsychBills.length,
        missingPsychKeys,
      });
    }
  }

  const invoiceIssues = psychInvoices.map((inv) => {
    const psychLines = inv.lineItems.filter((li) => PSYCHOTHERAPY_CODES.has(li.procedureCode));
    const hasRaLine = inv.remittanceLines.length > 0;
    const latestRa = inv.remittanceLines.at(-1);
    return {
      invoiceNumber: inv.invoiceNumber,
      claim: inv.client.lniClaimNumber,
      client: `${inv.client.firstName} ${inv.client.lastName}`,
      therapist: inv.therapist.email,
      paymentStatus: inv.paymentStatus,
      dos: psychLines.map((li) => ({
        date: calendarIsoFromDate(li.serviceDate),
        code: li.procedureCode,
        amount: Number(li.amount),
      })),
      hasRaLine,
      latestRa: latestRa
        ? {
            remittanceNumber: latestRa.remittanceAdvice.remittanceNumber,
            section: latestRa.section,
            date: latestRa.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
          }
        : null,
    };
  });

  const unpaidNoRa = invoiceIssues.filter((i) => !i.hasRaLine);
  const unpaidWithRa = invoiceIssues.filter(
    (i) => i.hasRaLine && i.paymentStatus !== "PAID" && i.latestRa?.section === "PAID",
  );
  const paidCount = invoiceIssues.filter((i) => i.paymentStatus === "PAID").length;
  const inProcessCount = invoiceIssues.filter((i) => i.paymentStatus === "IN_PROCESS").length;
  const deniedCount = invoiceIssues.filter((i) => i.paymentStatus === "DENIED").length;
  const unpaidCount = invoiceIssues.filter((i) => i.paymentStatus === "UNPAID" || !i.paymentStatus).length;

  const summary = {
    psychotherapyInvoices: psychInvoices.length,
    paid: paidCount,
    inProcess: inProcessCount,
    denied: deniedCount,
    unpaid: unpaidCount,
    withoutRaLine: unpaidNoRa.length,
    raGaps: raGaps.length,
    statusMismatch: unpaidWithRa.length,
  };

  console.log("\n=== Psychotherapy invoice summary ===");
  console.log(summary);
  console.log(`\nRAs with parse/import gaps: ${raGaps.length}`);
  for (const gap of raGaps) {
    console.log(
      `  RA ${gap.remittanceNumber}: DB ${gap.dbBills} bills (${gap.dbPsych} psych) → parsed ${gap.parsedBills} (${gap.parsedPsych} psych), missing ${gap.missingPsychKeys.length}`,
    );
  }

  if (unpaidNoRa.length) {
    console.log(`\nPsychotherapy invoices without any RA line (${unpaidNoRa.length}):`);
    for (const row of unpaidNoRa.slice(0, 30)) {
      console.log(
        `  #${row.invoiceNumber} ${row.claim} ${row.dos.map((d) => `${d.code}@${d.date}`).join(", ")} status=${row.paymentStatus ?? "null"}`,
      );
    }
    if (unpaidNoRa.length > 30) console.log(`  ... and ${unpaidNoRa.length - 30} more`);
  }

  let reimported: Array<{ remittanceNumber: string; billCount: number; psychBillCount: number }> = [];
  const reimportFailed: Array<{ remittanceNumber: string; error: string }> = [];
  const toReimport = raGaps.filter(
    (gap) => gap.missingPsychKeys.length > 0 || gap.parsedPsych > gap.dbPsych,
  );
  if (fix && toReimport.length > 0) {
    console.log(`\nRe-importing ${toReimport.length} RA(s) with missing psychotherapy bills...`);
    for (const gap of toReimport) {
      const file =
        (gap.sourceFilename ? fileByName.get(gap.sourceFilename) : undefined) ??
        driveFiles.find((f) => f.name.includes(gap.remittanceNumber));
      if (!file) continue;
      console.log(`  reimport RA ${gap.remittanceNumber}...`);
      try {
        const result = await reimportAppliedRemittance({
          remittanceNumber: gap.remittanceNumber,
          sourceFilename: gap.sourceFilename,
          file,
          accessToken,
          adminId: admin.id,
        });
        reimported.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reimportFailed.push({ remittanceNumber: gap.remittanceNumber, error: message });
        console.error(`    FAILED RA ${gap.remittanceNumber}: ${message}`);
      }
    }

    const reconcile = await reconcileAllInvoicePaymentStatuses();
    console.log(`Reconciled ${reconcile.updated} invoice payment status(es)`);
  }

  const finalPsych = fix
    ? await prisma.invoice.findMany({
        where: {
          status: "BILLED",
          lineItems: { some: { procedureCode: { in: [...PSYCHOTHERAPY_CODES] } } },
        },
        select: { invoiceNumber: true, paymentStatus: true },
      })
    : [];

  const output = {
    summary,
    raGaps,
    unpaidNoRa,
    unpaidWithRa,
    reimported,
    reimportFailed,
    finalStatus:
      fix
        ? {
            paid: finalPsych.filter((i) => i.paymentStatus === "PAID").length,
            inProcess: finalPsych.filter((i) => i.paymentStatus === "IN_PROCESS").length,
            denied: finalPsych.filter((i) => i.paymentStatus === "DENIED").length,
            unpaid: finalPsych.filter((i) => i.paymentStatus === "UNPAID" || !i.paymentStatus).length,
          }
        : null,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`\nResults written to ${RESULTS_PATH}`);

  if (!fix && (raGaps.length > 0 || unpaidNoRa.length > 0)) {
    console.log("\nRun with --fix to re-import affected RAs and reconcile.");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
