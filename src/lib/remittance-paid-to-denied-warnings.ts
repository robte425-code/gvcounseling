import type { PaymentStatus } from "@/generated/prisma/client";
import type { RemittanceBillSection } from "@/lib/parse-lni-remittance-pdf";
import {
  formatInvoiceEobNotes,
  effectiveEobCodesForResolution,
  parseInvoiceEobDescriptions,
  resolvePaymentFromRemittanceLines,
} from "@/lib/invoice-payment-status";

export type PaidToDeniedWarning = {
  lineId: string;
  claimNumber: string;
  patientName: string | null;
  invoiceId: string;
  invoiceNumber: number;
  therapistName: string;
  /** Invoice stays PAID after apply (EOB 309/101 duplicate denial). */
  willRemainPaid: boolean;
  eobCodes: string[];
  eobNote: string | null;
};

type RemittanceLineForWarning = {
  id: string;
  section: RemittanceBillSection;
  claimNumber: string;
  patientName: string | null;
  eobCodes: string[];
  eobCodeDescriptions: unknown;
  supersededAt: Date | null;
  matchedInvoice: {
    id: string;
    invoiceNumber: number;
    paymentStatus: PaymentStatus | null;
    therapist: { firstName: string; lastName: string };
  } | null;
};

type AppliedLineForPrediction = {
  section: RemittanceBillSection;
  remittanceDate: Date;
  eobCodes: string[];
  eobCodeDescriptions: unknown;
};

function lineEobDescriptions(
  line: Pick<RemittanceLineForWarning, "eobCodes" | "eobCodeDescriptions">,
  raCatalog: Record<string, string>,
): Record<string, string> {
  return {
    ...raCatalog,
    ...parseInvoiceEobDescriptions(line.eobCodeDescriptions),
  };
}

function effectiveDenialEobCodes(
  line: Pick<RemittanceLineForWarning, "section" | "eobCodes">,
  raCatalog: Record<string, string>,
  hasEarlierPaid: boolean,
): string[] {
  return effectiveEobCodesForResolution(line, raCatalog, hasEarlierPaid);
}

function predictStatusAfterApply(
  invoiceId: string,
  previewLine: RemittanceLineForWarning,
  previewRemittanceDate: Date,
  appliedLinesByInvoice: Map<string, AppliedLineForPrediction[]>,
  raCatalog: Record<string, string>,
): PaymentStatus | null {
  const applied = appliedLinesByInvoice.get(invoiceId) ?? [];
  const hasEarlierPaid = applied.some((line) => line.section === "PAID");
  const eobCodes = effectiveDenialEobCodes(previewLine, raCatalog, hasEarlierPaid);
  const descriptions = lineEobDescriptions(
    { ...previewLine, eobCodes },
    raCatalog,
  );
  const resolved = resolvePaymentFromRemittanceLines([
    ...applied,
    {
      section: previewLine.section,
      remittanceDate: previewRemittanceDate,
      eobCodes,
      eobCodeDescriptions: descriptions,
    },
  ]);
  return resolved?.paymentStatus ?? null;
}

export function findPaidToDeniedRemittanceWarnings(
  lines: RemittanceLineForWarning[],
  options: {
    remittanceDate: Date;
    raEobCatalog: Record<string, string>;
    appliedLinesByInvoice: Map<string, AppliedLineForPrediction[]>;
  },
): PaidToDeniedWarning[] {
  const warnings: PaidToDeniedWarning[] = [];

  for (const line of lines) {
    if (line.supersededAt || line.section !== "DENIED" || !line.matchedInvoice) continue;
    if (line.matchedInvoice.paymentStatus !== "PAID") continue;

    const appliedForInvoice = options.appliedLinesByInvoice.get(line.matchedInvoice.id) ?? [];
    const hasEarlierPaid = appliedForInvoice.some((entry) => entry.section === "PAID");
    const eobCodes = effectiveDenialEobCodes(line, options.raEobCatalog, hasEarlierPaid);
    const descriptions = lineEobDescriptions({ ...line, eobCodes }, options.raEobCatalog);
    const predicted = predictStatusAfterApply(
      line.matchedInvoice.id,
      line,
      options.remittanceDate,
      options.appliedLinesByInvoice,
      options.raEobCatalog,
    );
    const willRemainPaid = predicted === "PAID";

    warnings.push({
      lineId: line.id,
      claimNumber: line.claimNumber,
      patientName: line.patientName,
      invoiceId: line.matchedInvoice.id,
      invoiceNumber: line.matchedInvoice.invoiceNumber,
      therapistName: `${line.matchedInvoice.therapist.firstName} ${line.matchedInvoice.therapist.lastName}`,
      willRemainPaid,
      eobCodes,
      eobNote: formatInvoiceEobNotes(eobCodes, descriptions),
    });
  }

  return warnings.sort((a, b) => a.invoiceNumber - b.invoiceNumber);
}

export function paidToDeniedWarningSummary(warnings: PaidToDeniedWarning[]): string {
  if (!warnings.length) return "";

  const remainPaid = warnings.filter((w) => w.willRemainPaid);
  const flipDenied = warnings.filter((w) => !w.willRemainPaid);

  const parts: string[] = [];
  if (flipDenied.length) {
    parts.push(
      `${flipDenied.length} previously PAID invoice${flipDenied.length === 1 ? "" : "s"} would change to DENIED`,
    );
  }
  if (remainPaid.length) {
    parts.push(
      `${remainPaid.length} duplicate-paid denial${remainPaid.length === 1 ? "" : "s"} (EOB 309/101) — invoice${remainPaid.length === 1 ? "" : "s"} will stay PAID`,
    );
  }
  return parts.join("\n");
}
