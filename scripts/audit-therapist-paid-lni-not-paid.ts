/**
 * Find invoices where therapist Payment = Paid but L&I status != PAID.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/audit-therapist-paid-lni-not-paid.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { formatInvoiceEobNotes } from "../src/lib/invoice-payment-status";

const SPREADSHEET_RA_NUMBERS = new Set(["MARIA-SPREADSHEET", "STEVEN-SPREADSHEET"]);
const RESULTS_PATH = "scripts/audit-therapist-paid-lni-not-paid-results.json";

type ConflictReason =
  | "spreadsheet_historical_sync"
  | "lni_status_changed_after_therapist_paid"
  | "therapist_paid_via_ra_but_lni_now_denied"
  | "therapist_paid_via_ra_but_lni_unpaid"
  | "therapist_paid_via_ra_but_lni_in_process"
  | "no_ra_line"
  | "mixed_sources";

function inferReason(input: {
  paymentStatus: string;
  hasRaLine: boolean;
  payRunSources: string[];
  raSections: string[];
  hadPaidRaLine: boolean;
}): ConflictReason {
  const onlySpreadsheet = input.payRunSources.every((s) => SPREADSHEET_RA_NUMBERS.has(s));
  const hasSpreadsheet = input.payRunSources.some((s) => SPREADSHEET_RA_NUMBERS.has(s));
  const hasRealRa = input.payRunSources.some((s) => !SPREADSHEET_RA_NUMBERS.has(s));

  if (!input.hasRaLine) {
    if (onlySpreadsheet || input.payRunSources.length === 0) return "spreadsheet_historical_sync";
    return "no_ra_line";
  }

  if (hasSpreadsheet && hasRealRa) return "mixed_sources";
  if (onlySpreadsheet) return "spreadsheet_historical_sync";

  if (input.hadPaidRaLine && input.paymentStatus !== "PAID") {
    return "lni_status_changed_after_therapist_paid";
  }

  switch (input.paymentStatus) {
    case "DENIED":
      return "therapist_paid_via_ra_but_lni_now_denied";
    case "UNPAID":
      return "therapist_paid_via_ra_but_lni_unpaid";
    case "IN_PROCESS":
      return "therapist_paid_via_ra_but_lni_in_process";
    default:
      return "mixed_sources";
  }
}

function reasonLabel(reason: ConflictReason): string {
  switch (reason) {
    case "spreadsheet_historical_sync":
      return "Therapist marked paid from billing spreadsheet (LNI Payment = Verified) without checking current L&I RA status";
    case "lni_status_changed_after_therapist_paid":
      return "Therapist was paid via a real RA pay run when L&I was PAID; L&I status later changed (re-import/reconcile)";
    case "therapist_paid_via_ra_but_lni_now_denied":
      return "Therapist pay run line exists from a real RA, but invoice L&I status is now DENIED";
    case "therapist_paid_via_ra_but_lni_unpaid":
      return "Therapist pay run line exists from a real RA, but invoice has no PAID L&I status";
    case "therapist_paid_via_ra_but_lni_in_process":
      return "Therapist pay run line exists from a real RA, but L&I status is IN_PROCESS";
    case "no_ra_line":
      return "Therapist paid but invoice has no remittance line at all";
    case "mixed_sources":
      return "Therapist paid from multiple sources (spreadsheet + RA pay runs)";
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (out[key] ??= []).push(item);
  }
  return out;
}

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      paymentStatus: { not: "PAID" },
      payRunLines: { some: {} },
    },
    include: {
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      therapist: { select: { email: true, firstName: true, lastName: true } },
      lineItems: { select: { procedureCode: true, serviceDate: true, amount: true } },
      remittanceLines: {
        where: { supersededAt: null },
        include: {
          remittanceAdvice: {
            select: { remittanceNumber: true, invoiceDate: true, status: true },
          },
        },
        orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
      },
      payRunLines: {
        include: {
          payout: {
            include: {
              payRun: {
                include: {
                  remittanceAdvice: {
                    select: {
                      remittanceNumber: true,
                      sourceFilename: true,
                      invoiceDate: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const conflicts = invoices.map((inv) => {
    const payRunSources = [
      ...new Set(
        inv.payRunLines.map(
          (pl) => pl.payout.payRun.remittanceAdvice?.remittanceNumber ?? "unknown",
        ),
      ),
    ];
    const raSections = inv.remittanceLines.map((rl) => rl.section);
    const hadPaidRaLine = inv.remittanceLines.some((rl) => rl.section === "PAID");
    const latestRa = inv.remittanceLines.at(-1);
    const reason = inferReason({
      paymentStatus: inv.paymentStatus,
      hasRaLine: inv.remittanceLines.length > 0,
      payRunSources,
      raSections,
      hadPaidRaLine,
    });

    return {
      invoiceNumber: inv.invoiceNumber,
      lniStatus: inv.paymentStatus,
      client: `${inv.client.firstName} ${inv.client.lastName}`,
      claim: inv.client.lniClaimNumber,
      therapist: `${inv.therapist.firstName} ${inv.therapist.lastName}`,
      therapistEmail: inv.therapist.email,
      dos: inv.lineItems.map((l) => ({
        date: l.serviceDate.toISOString().slice(0, 10),
        code: l.procedureCode,
        amount: Number(l.amount),
      })),
      lniEob: formatInvoiceEobNotes(inv.lniEobCodes, inv.lniEobCodeDescriptions as Record<string, string>),
      reason,
      reasonDetail: reasonLabel(reason),
      payRunSources,
      therapistAmounts: inv.payRunLines.map((pl) => ({
        amount: Number(pl.therapistAmount),
        ra: pl.payout.payRun.remittanceAdvice?.remittanceNumber ?? null,
        raDate: pl.payout.payRun.remittanceAdvice?.invoiceDate?.toISOString().slice(0, 10) ?? null,
        raSource: pl.payout.payRun.remittanceAdvice?.sourceFilename ?? null,
      })),
      remittanceLines: inv.remittanceLines.map((rl) => ({
        ra: rl.remittanceAdvice.remittanceNumber,
        raDate: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
        section: rl.section,
        eobCodes: rl.eobCodes,
      })),
      latestRa: latestRa
        ? {
            ra: latestRa.remittanceAdvice.remittanceNumber,
            section: latestRa.section,
            date: latestRa.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
          }
        : null,
    };
  });

  const byReason = groupBy(conflicts, (c) => c.reason);

  const summary = {
    totalConflicts: conflicts.length,
    byLniStatus: Object.fromEntries(
      ["DENIED", "UNPAID", "IN_PROCESS", "APPEAL_IN_PROGRESS"].map((s) => [
        s,
        conflicts.filter((c) => c.lniStatus === s).length,
      ]),
    ),
    byReason: Object.fromEntries(
      Object.entries(byReason).map(([reason, rows]) => [reason, rows.length]),
    ),
    byTherapist: Object.fromEntries(
      Object.entries(groupBy(conflicts, (c) => c.therapistEmail)).map(([email, rows]) => [
        email,
        rows.length,
      ]),
    ),
    byPayRunSource: Object.fromEntries(
      Object.entries(
        groupBy(
          conflicts.flatMap((c) => c.payRunSources.map((s) => ({ source: s, invoice: c.invoiceNumber }))),
          (x) => x.source,
        ),
      ).map(([source, rows]) => [source, rows.length]),
    ),
  };

  const output = { summary, conflicts };
  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${RESULTS_PATH}`);
  console.log("\nSample conflicts:");
  for (const c of conflicts.slice(0, 15)) {
    console.log(
      `#${c.invoiceNumber} ${c.lniStatus} | ${c.claim} | ${c.reason} | pay via ${c.payRunSources.join(", ")}`,
    );
  }

  await prisma.$disconnect();
}

main();
