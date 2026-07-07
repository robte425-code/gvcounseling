import type { PaymentStatus } from "@/generated/prisma/client";
import type { RemittanceBillSection } from "@/lib/parse-lni-remittance-pdf";
import { normalizeEobCode } from "@/lib/parse-lni-remittance-pdf";

export type InferredPayment = {
  paymentStatus: PaymentStatus;
  lniPaidAt: Date | null;
};

/** L&I remittance section → invoice `paymentStatus` (L&I status from RAs). */
export function remittanceSectionToPaymentStatus(section: RemittanceBillSection): PaymentStatus {
  switch (section) {
    case "PAID":
    case "DENIED":
    case "IN_PROCESS":
      return section;
  }
}

/** Higher wins when one invoice matches multiple bills on the same remittance. */
export function remittanceSectionPriority(section: RemittanceBillSection): number {
  switch (section) {
    case "PAID":
      return 3;
    case "IN_PROCESS":
      return 2;
    case "DENIED":
      return 1;
  }
}

export type RemittanceLinePaymentInput = {
  section: RemittanceBillSection;
  remittanceDate: Date;
  eobCodes: string[];
  eobCodeDescriptions: unknown;
};

export type RemittanceLineResolutionInput = {
  section: RemittanceBillSection;
  remittanceDate: Date;
  eobCodes: string[];
  eobCodeDescriptions: unknown;
  raEobCodeDescriptions?: unknown;
};

export function mapRemittanceLinesForResolution(
  lines: RemittanceLineResolutionInput[],
): RemittanceLinePaymentInput[] {
  const hasEarlierPaid = lines.some((line) => line.section === "PAID");
  const raCatalog = lines.reduce<Record<string, string>>((acc, line) => {
    return { ...acc, ...parseInvoiceEobDescriptions(line.raEobCodeDescriptions) };
  }, {});

  return lines.map((line) => {
    const catalog = {
      ...raCatalog,
      ...parseInvoiceEobDescriptions(line.eobCodeDescriptions),
    };
    const eobCodes = effectiveEobCodesForResolution(line, catalog, hasEarlierPaid);
    return {
      section: line.section,
      remittanceDate: line.remittanceDate,
      eobCodes,
      eobCodeDescriptions: catalog,
    };
  });
}

/** When a denied line omits EOB codes in DB, infer 309 only if an earlier paid line exists. */
export function effectiveEobCodesForResolution(
  line: { section: RemittanceBillSection; eobCodes: string[] },
  catalog: Record<string, string>,
  hasEarlierPaid: boolean,
): string[] {
  if (line.eobCodes.length > 0) return line.eobCodes;
  if (line.section === "DENIED" && hasEarlierPaid && catalog["309"]) return ["309"];
  return line.eobCodes;
}

/** EOB 309 and similar codes mean L&I denied a duplicate rebill, not a clawback of prior payment. */
export function isPreviouslyPaidDuplicateEob(
  codes: string[],
  descriptions: Record<string, string>,
  catalog?: Record<string, string>,
): boolean {
  for (const code of codes) {
    const normalized = normalizeEobCode(code);
    if (normalized === "309") return true;
    const text = descriptions[normalized] ?? descriptions[code] ?? catalog?.[normalized] ?? catalog?.[code] ?? "";
    if (/previously paid/i.test(text)) return true;
  }
  return false;
}

/** Pick payment from the latest remittance date; PAID beats IN_PROCESS beats DENIED on that date. */
export function resolvePaymentFromRemittanceLines(
  lines: RemittanceLinePaymentInput[],
): (InferredPayment & { eobCodes: string[]; eobCodeDescriptions: Record<string, string> }) | null {
  if (lines.length === 0) return null;

  const latestDate = lines.reduce(
    (max, line) => (line.remittanceDate > max ? line.remittanceDate : max),
    lines[0]!.remittanceDate,
  );
  const latestLines = lines.filter((line) => line.remittanceDate.getTime() === latestDate.getTime());

  let best = latestLines[0]!;
  for (const line of latestLines) {
    if (remittanceSectionPriority(line.section) > remittanceSectionPriority(best.section)) {
      best = line;
    }
  }

  const bestDescriptions = {
    ...parseInvoiceEobDescriptions(best.eobCodeDescriptions),
  };

  if (
    best.section === "DENIED" &&
    isPreviouslyPaidDuplicateEob(best.eobCodes, bestDescriptions)
  ) {
    const earlierPaid = [...lines]
      .filter((line) => line.section === "PAID")
      .sort((a, b) => b.remittanceDate.getTime() - a.remittanceDate.getTime())[0];
    if (earlierPaid) {
      const paidUpdate = paymentUpdateFromRemittance("PAID", earlierPaid.remittanceDate);
      return {
        ...paidUpdate,
        eobCodes: [...new Set([...earlierPaid.eobCodes, ...best.eobCodes])],
        eobCodeDescriptions: {
          ...parseInvoiceEobDescriptions(earlierPaid.eobCodeDescriptions),
          ...bestDescriptions,
        },
      };
    }
  }

  const payment = paymentUpdateFromRemittance(best.section, latestDate);
  return {
    ...payment,
    eobCodes: best.eobCodes,
    eobCodeDescriptions: bestDescriptions,
  };
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case "DENIED":
      return "Denied";
    case "IN_PROCESS":
      return "In process";
    case "UNPAID":
      return "Unpaid";
    case "APPEAL_IN_PROGRESS":
      return "Appeal in progress";
  }
}

export function remittanceSectionLabel(section: RemittanceBillSection): string {
  return paymentStatusLabel(remittanceSectionToPaymentStatus(section));
}

export function paymentUpdateFromRemittance(
  section: RemittanceBillSection,
  remittancePaymentDate: Date,
): InferredPayment {
  const paymentStatus = remittanceSectionToPaymentStatus(section);
  return {
    paymentStatus,
    lniPaidAt: paymentStatus === "PAID" ? remittancePaymentDate : null,
  };
}

/**
 * Map spreadsheet "LNI Payment" column to PaymentStatus.
 *
 * Column 11 ("LNI Paid") may contain expected warrant dates before L&I verifies
 * payment — it must not mark an invoice paid on its own. Only explicit values in
 * "LNI Payment" (e.g. "Verified") mean paid.
 */
export function inferPaymentStatusFromSpreadsheet(
  lniPaid: Date | null,
  lniPayment: string,
): InferredPayment {
  const pay = lniPayment.trim();

  if (/denied/i.test(pay)) {
    return { paymentStatus: "DENIED", lniPaidAt: lniPaid };
  }

  if (/^verified/i.test(pay) || pay === "Verified on 12/24/24 bill") {
    return { paymentStatus: "PAID", lniPaidAt: lniPaid };
  }

  if (/not paid/i.test(pay) || pay === "MISSING") {
    return { paymentStatus: "UNPAID", lniPaidAt: null };
  }

  if (/in process/i.test(pay) || /action is being taken/i.test(pay)) {
    return { paymentStatus: "IN_PROCESS", lniPaidAt: null };
  }

  return { paymentStatus: "UNPAID", lniPaidAt: null };
}

export function parseInvoiceEobDescriptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/** Human-readable L&I EOB notes for invoice list/detail (from remittance advice). */
export function formatInvoiceEobNotes(
  codes: string[],
  descriptions: Record<string, string>,
): string | null {
  if (!codes.length) return null;

  const parts = codes.map((code) => {
    const description = descriptions[code];
    return description ? `EOB ${code}: ${description}` : `EOB ${code}`;
  });

  return parts.join(" ");
}
