import { calendarIsoFromDate } from "@/lib/constants";
import { client837Ready } from "@/lib/constants";
import { invoice837PayPeriodWhere } from "@/lib/invoice-list-filters";
import { loadAllProcedureCodeFees, resolveFeeAmount } from "@/lib/procedure-fees";
import { prisma } from "@/lib/prisma";

export type Edi837BatchLineIssue = {
  kind: "missing_fee" | "amount_mismatch";
  message: string;
};

export type Edi837BatchInvoiceRow = {
  invoiceId: string;
  invoiceNumber: number;
  status: "DRAFT" | "SUBMITTED" | "BILLED";
  claimNumber: string;
  clientName: string;
  therapistName: string;
  clmControlNumber: string | null;
  clmNote: string | null;
  invoiceTotalAmount: number;
  lniBillAmount: number;
  blockers: string[];
  warnings: string[];
  lineIssues: Edi837BatchLineIssue[];
  ready: boolean;
};

export type Edi837BatchReport = {
  payPeriodId: string;
  payPeriodLabel: string;
  cutoffDate: string;
  invoiceCount: number;
  readyCount: number;
  blockerCount: number;
  warningCount: number;
  totalLniBillAmount: number;
  submittedCount: number;
  billedCount: number;
  canGenerate: boolean;
  invoices: Edi837BatchInvoiceRow[];
};

const invoice837Include = {
  client: true,
  therapist: true,
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  payPeriod: { select: { label: true, cutoffDate: true } },
} as const;

type InvoiceFor837Batch = Awaited<
  ReturnType<typeof loadInvoicesFor837PayPeriod>
>[number];

export async function loadInvoicesFor837PayPeriod(payPeriodId: string) {
  return prisma.invoice.findMany({
    where: invoice837PayPeriodWhere(payPeriodId),
    include: invoice837Include,
    orderBy: [{ therapist: { lastName: "asc" } }, { invoiceNumber: "asc" }],
  });
}

function evaluateInvoiceRow(
  invoice: InvoiceFor837Batch,
  lniFeeSchedule: Awaited<ReturnType<typeof loadAllProcedureCodeFees>>,
): Edi837BatchInvoiceRow {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const lineIssues: Edi837BatchLineIssue[] = [];

  const readiness = client837Ready(invoice.client);
  if (!readiness.ready) {
    blockers.push(...readiness.missing.map((field) => `Client: ${field}`));
  }
  if (!invoice.therapist.lniProviderId) {
    blockers.push("Therapist L&I provider ID missing");
  }
  if (!invoice.therapist.npi) {
    blockers.push("Therapist NPI missing");
  }

  let lniBillAmount = 0;
  for (const line of invoice.lineItems) {
    const feeAmount = resolveFeeAmount(lniFeeSchedule, line.procedureCode, line.serviceDate);
    const invoiceLineAmount = Number(line.amount);
    const serviceDateLabel = calendarIsoFromDate(line.serviceDate);

    if (feeAmount === null) {
      const message = `${line.procedureCode} on ${serviceDateLabel} — no L&I fee on file`;
      blockers.push(message);
      lineIssues.push({ kind: "missing_fee", message });
      lniBillAmount += Number.isFinite(invoiceLineAmount) ? invoiceLineAmount : 0;
      continue;
    }

    lniBillAmount += feeAmount * line.units;

    if (
      Number.isFinite(invoiceLineAmount) &&
      Math.abs(feeAmount * line.units - invoiceLineAmount) > 0.01
    ) {
      const message = `${line.procedureCode} on ${serviceDateLabel}: invoice ${invoiceLineAmount.toFixed(2)} vs L&I fee ${(feeAmount * line.units).toFixed(2)}`;
      warnings.push(message);
      lineIssues.push({ kind: "amount_mismatch", message });
    }
  }

  lniBillAmount = Math.round(lniBillAmount * 100) / 100;
  const invoiceTotalAmount = Math.round(Number(invoice.totalAmount) * 100) / 100;

  if (Math.abs(lniBillAmount - invoiceTotalAmount) > 0.01 && invoice.lineItems.length > 0) {
    warnings.push(
      `Invoice total ${invoiceTotalAmount.toFixed(2)} vs L&I bill amount ${lniBillAmount.toFixed(2)}`,
    );
  }

  const clmNote = invoice.clmControlNumber ? null : "Assigned when you generate 837";

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    claimNumber: invoice.client.lniClaimNumber,
    clientName: `${invoice.client.lastName}, ${invoice.client.firstName}`,
    therapistName: `${invoice.therapist.firstName} ${invoice.therapist.lastName}`,
    clmControlNumber: invoice.clmControlNumber,
    clmNote,
    invoiceTotalAmount,
    lniBillAmount,
    blockers,
    warnings,
    lineIssues,
    ready: blockers.length === 0,
  };
}

export async function buildEdi837BatchReport(payPeriodId: string): Promise<Edi837BatchReport> {
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found.");

  const invoices = await loadInvoicesFor837PayPeriod(payPeriodId);
  if (!invoices.length) {
    throw new Error(
      "No invoices are assigned to this pay period. Assign submitted invoices on the Invoices page first.",
    );
  }

  const lniFeeSchedule = await loadAllProcedureCodeFees();
  const rows = invoices.map((invoice) => evaluateInvoiceRow(invoice, lniFeeSchedule));

  const readyCount = rows.filter((row) => row.ready).length;
  const blockerCount = rows.filter((row) => !row.ready).length;
  const warningCount = rows.filter((row) => row.warnings.length > 0).length;
  const totalLniBillAmount = Math.round(
    rows.reduce((sum, row) => sum + row.lniBillAmount, 0) * 100,
  ) / 100;

  return {
    payPeriodId,
    payPeriodLabel: payPeriod.label ?? calendarIsoFromDate(payPeriod.cutoffDate),
    cutoffDate: calendarIsoFromDate(payPeriod.cutoffDate),
    invoiceCount: rows.length,
    readyCount,
    blockerCount,
    warningCount,
    totalLniBillAmount,
    submittedCount: rows.filter((row) => row.status === "SUBMITTED").length,
    billedCount: rows.filter((row) => row.status === "BILLED").length,
    canGenerate: blockerCount === 0,
    invoices: rows,
  };
}

export type Edi837InvoiceSnapshot = {
  invoiceId: string;
  invoiceNumber: number;
  claimNumber: string;
  clmControlNumber: string;
  lniBillAmount: number;
  statusBefore: "DRAFT" | "SUBMITTED" | "BILLED";
};

export function buildInvoiceSnapshotFromBatchRows(
  rows: Edi837BatchInvoiceRow[],
  resolvedClms: Map<string, string>,
): Edi837InvoiceSnapshot[] {
  return rows.map((row) => ({
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    claimNumber: row.claimNumber,
    clmControlNumber: row.clmControlNumber ?? resolvedClms.get(row.invoiceId) ?? "",
    lniBillAmount: row.lniBillAmount,
    statusBefore: row.status,
  }));
}
