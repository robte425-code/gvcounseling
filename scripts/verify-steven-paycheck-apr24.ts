/**
 * Verify Steven's Apr 24, 2026 paycheck against applied RA lines.
 *
 * Usage: npx tsx scripts/verify-steven-paycheck-apr24.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { writeFileSync } from "fs";
import { formatDate } from "../src/lib/constants";

const TARGET_PAY_PERIOD_LABEL = "Apr 24, 2026";
const OUTPUT_PATH = "scripts/verify-steven-paycheck-apr24-results.json";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { loadPaycheckDetail, loadPaycheckSummaries } = await import("../src/lib/paychecks");
  const { computeTherapistAmountForInvoice } = await import("../src/lib/remittance-advice");

  const steven = await prisma.user.findUnique({
    where: { email: "steven@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true, lniProviderId: true },
  });
  if (!steven) throw new Error("Steven user not found");

  const summaries = await loadPaycheckSummaries({ therapistId: steven.id });
  const target =
    summaries.find((s) => s.payPeriodLabel === TARGET_PAY_PERIOD_LABEL) ??
    summaries.find((s) => s.paymentDateLabel === TARGET_PAY_PERIOD_LABEL);
  if (!target) {
    console.log(
      "No paycheck for",
      TARGET_PAY_PERIOD_LABEL,
      "\nAvailable:",
      summaries.map((s) => `${s.payPeriodLabel} / pay ${s.paymentDateLabel} ($${s.therapistAmount})`),
    );
    return;
  }

  const feeRows = await prisma.therapistProcedureCodeFee.findMany({ where: { therapistId: steven.id } });

  const detail = await loadPaycheckDetail({
    payPeriodId: target.payPeriodId,
    therapistId: steven.id,
    invoiceBasePath: "/portal/admin/invoices",
  });
  if (!detail) throw new Error("Paycheck detail not found");

  const remittanceNumbers = [...new Set(detail.invoices.map((inv) => inv.remittanceNumber))];
  const raReports: Array<Record<string, unknown>> = [];

  for (const raNum of remittanceNumbers) {
    const ra = await prisma.remittanceAdvice.findFirst({
      where: { remittanceNumber: raNum },
      include: {
        lines: {
          where: { supersededAt: null },
          include: {
            matchedInvoice: {
              include: {
                therapist: { select: { email: true, id: true } },
                lineItems: { orderBy: { sortOrder: "asc" } },
                client: { select: { lniClaimNumber: true, lastName: true, firstName: true } },
              },
            },
          },
        },
        payRun: {
          include: {
            payouts: {
              where: { therapistId: steven.id },
              include: { lines: true },
            },
          },
        },
      },
    });
    if (!ra) continue;

    const payout = ra.payRun?.payouts[0];

    const lineDetails = await Promise.all(
      detail.invoices
        .filter((inv) => inv.remittanceNumber === raNum)
        .map(async (portalInv) => {
          const raLine = ra.lines.find(
            (l) => l.matchedInvoice?.invoiceNumber === portalInv.invoiceNumber,
          );
          const payRunLine = payout?.lines.find((l) => l.invoiceId === raLine?.matchedInvoiceId);
          const invoice = raLine?.matchedInvoice;
          const recalculated =
            invoice && raLine?.section === "PAID"
              ? await computeTherapistAmountForInvoice(invoice, feeRows)
              : null;

          return {
            invoiceNumber: portalInv.invoiceNumber,
            claim: invoice?.client.lniClaimNumber,
            client: invoice ? `${invoice.client.lastName}, ${invoice.client.firstName}` : null,
            raSection: raLine?.section,
            raPayable: raLine ? Number(raLine.billTotalPayable) : null,
            portalTherapistAmount: portalInv.therapistAmount,
            recalculatedTherapistAmount: recalculated,
            payRunTherapistAmount: payRunLine ? Number(payRunLine.therapistAmount) : null,
            invoiceLineItems:
              invoice?.lineItems.map((li) => ({
                code: li.procedureCode,
                amount: Number(li.amount),
                units: li.units,
                serviceDate: formatDate(li.serviceDate),
              })) ?? [],
            billingPayPeriod: portalInv.billingPayPeriodLabel,
          };
        }),
    );

    const recalculatedTotal = lineDetails.reduce(
      (sum, line) => sum + (line.recalculatedTherapistAmount ?? 0),
      0,
    );

    const allStevenRaLines = ra.lines.filter((l) => l.matchedInvoice?.therapistId === steven.id);

    raReports.push({
      remittanceNumber: ra.remittanceNumber,
      warrantRegister: ra.warrantRegister,
      invoiceDate: formatDate(ra.invoiceDate),
      sourceFilename: ra.sourceFilename,
      portalTotal: detail.therapistAmount,
      recalculatedTotal: Math.round(recalculatedTotal * 100) / 100,
      payRunTotal: payout ? Number(payout.therapistAmount) : null,
      stevenPaidRaLines: allStevenRaLines.length,
      allStevenRaLineSummary: allStevenRaLines.map((line) => ({
        invoiceNumber: line.matchedInvoice?.invoiceNumber,
        claim: line.claimNumber,
        section: line.section,
        raPayable: Number(line.billTotalPayable),
        onPortalPaycheck: detail.invoices.some(
          (inv) => inv.invoiceNumber === line.matchedInvoice?.invoiceNumber,
        ),
      })),
      lines: lineDetails,
    });
  }

  const result = {
    therapist: steven,
    paycheck: {
      payPeriodLabel: detail.payPeriodLabel,
      paymentDateLabel: detail.paymentDateLabel,
      portalTherapistTotal: detail.therapistAmount,
      portalLniTotal: detail.lniPaidAmount,
      invoiceCount: detail.invoices.length,
    },
    remittances: raReports,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
