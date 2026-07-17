import {
  buildEdi837,
  generateClmControlNumber,
  type Edi837Claim,
  type Edi837Result,
  type IsaUsageIndicator,
} from "@/lib/edi837";
import {
  buildEdi837BatchReport,
  buildInvoiceSnapshotFromBatchRows,
  loadInvoicesFor837PayPeriod,
} from "@/lib/edi837-batch-report";
import { archiveEdi837ToDrive } from "@/lib/edi837-drive-archive";
import { recordEdi837Submission } from "@/lib/edi837-submission";
import { resolveClientBirthDate } from "@/lib/constants";
import { loadAllProcedureCodeFees, resolveFeeAmount } from "@/lib/procedure-fees";
import { prisma } from "@/lib/prisma";

type ResolvedInvoice = Awaited<ReturnType<typeof loadInvoicesFor837PayPeriod>>[number] & {
  resolvedClm: string;
};

function resolveClmsForInvoices(
  invoices: Awaited<ReturnType<typeof loadInvoicesFor837PayPeriod>>,
): ResolvedInvoice[] {
  return invoices.map((inv) => ({
    ...inv,
    resolvedClm: inv.clmControlNumber ?? generateClmControlNumber(),
  }));
}

async function persistBilledInvoices(invoices: ResolvedInvoice[]): Promise<void> {
  const now = new Date();
  await prisma.$transaction(
    invoices.map((inv) =>
      prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ...(inv.clmControlNumber ? {} : { clmControlNumber: inv.resolvedClm }),
          ...(inv.status === "SUBMITTED" ? { status: "BILLED", billedAt: now } : {}),
        },
      }),
    ),
  );
}

async function buildEdiClaimsForResolvedInvoices(invoices: ResolvedInvoice[]): Promise<Edi837Claim[]> {
  const lniFeeSchedule = await loadAllProcedureCodeFees();

  return invoices.map((inv) => {
    const dx = inv.client.diagnoses;
    return {
      clmControlNumber: inv.resolvedClm,
      client: {
        claimNumber: inv.client.lniClaimNumber,
        lastName: inv.client.lastName,
        firstName: inv.client.firstName,
        addressLine1: inv.client.addressLine1!,
        city: inv.client.city!,
        state: inv.client.state,
        zip: inv.client.zip!,
        dateOfBirth: resolveClientBirthDate(inv.client)!,
        gender: inv.client.gender ?? "U",
        dateOfInjury: inv.client.dateOfInjury,
        primaryDiagnosis: dx[0]!,
        additionalDiagnoses: dx.slice(1),
      },
      therapist: {
        lastName: inv.therapist.lastName,
        firstName: inv.therapist.firstName,
        lniProviderId: inv.therapist.lniProviderId!,
        npi: inv.therapist.npi!,
      },
      lines: inv.lineItems.map((line) => {
        const feeAmount = resolveFeeAmount(lniFeeSchedule, line.procedureCode, line.serviceDate);
        return {
          procedureCode: line.procedureCode,
          amount: feeAmount ?? Number(line.amount),
          serviceDate: line.serviceDate,
          units: line.units,
        };
      }),
    };
  });
}

function formatBatchBlockerError(
  report: Awaited<ReturnType<typeof buildEdi837BatchReport>>,
): string {
  const samples = report.invoices
    .filter((row) => !row.ready)
    .slice(0, 5)
    .map((row) => `#${row.invoiceNumber} ${row.claimNumber}: ${row.blockers.join("; ")}`);
  return `Cannot generate 837. ${report.blockerCount} invoice(s) have blockers.${samples.length ? ` ${samples.join(" | ")}` : ""}`;
}

export async function generate837ForPayPeriod(
  payPeriodId: string,
  options?: {
    usageIndicator?: IsaUsageIndicator;
    generatedById?: string;
    /** Include already-billed invoices (re-download / Drive archive only). */
    includeBilled?: boolean;
    /** When false, skip writing the Drive archive copy. Default true. */
    archiveToDrive?: boolean;
  },
): Promise<Edi837Result & { driveArchiveFilename?: string }> {
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found.");

  const includeBilled = Boolean(options?.includeBilled);
  const report = await buildEdi837BatchReport(payPeriodId, { includeBilled });
  if (!report.canGenerate) {
    throw new Error(formatBatchBlockerError(report));
  }

  const invoices = await loadInvoicesFor837PayPeriod(payPeriodId, { includeBilled });
  const resolved = resolveClmsForInvoices(invoices);
  const claims = await buildEdiClaimsForResolvedInvoices(resolved);
  const result = buildEdi837(claims, { usageIndicator: options?.usageIndicator });
  await persistBilledInvoices(resolved);

  let driveArchiveFilename: string | undefined;
  if (options?.archiveToDrive !== false) {
    const archived = await archiveEdi837ToDrive({
      edi: result,
      initiatorUserId: options?.generatedById,
    });
    if (!archived) {
      console.warn(
        "837 was generated for download, but a Drive copy was not saved under root folder \"837 Files\".",
      );
    } else {
      driveArchiveFilename = archived.filename;
    }
  }

  if (options?.generatedById) {
    const clmByInvoiceId = new Map(resolved.map((inv) => [inv.id, inv.resolvedClm]));
    await recordEdi837Submission({
      payPeriodId,
      generatedById: options.generatedById,
      usageIndicator: options?.usageIndicator ?? "T",
      edi: result,
      invoiceSnapshot: buildInvoiceSnapshotFromBatchRows(report.invoices, clmByInvoiceId),
    });
  }

  return { ...result, driveArchiveFilename };
}
