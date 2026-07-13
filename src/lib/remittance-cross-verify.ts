import type { RemittanceBillSection, RemittanceSourceFormat } from "@/generated/prisma/client";
import type { RemittanceServiceLine } from "@/lib/parse-lni-remittance-pdf";
import { prisma } from "@/lib/prisma";

export type RemittanceLineForCompare = {
  section: RemittanceBillSection;
  claimNumber: string;
  icn: string;
  serviceProviderId: string;
  billTotalPayable: unknown;
  eobCodes: string[];
  serviceLines: unknown;
  matchedInvoiceId: string | null;
};

export type RemittanceAdviceForCompare = {
  id: string;
  remittanceNumber: string;
  warrantRegister: string;
  sourceFormat: RemittanceSourceFormat;
  totalPaid: unknown;
  lines: RemittanceLineForCompare[];
};

export type RemittanceCrossVerifyIssue = {
  kind:
    | "total_paid"
    | "line_count"
    | "missing_bill"
    | "extra_bill"
    | "section"
    | "payable"
    | "claim"
    | "service_lines"
    | "matched_invoice";
  message: string;
};

export type RemittanceCrossVerifyResult = {
  status: "matched" | "mismatched" | "missing_counterpart";
  counterpartId: string | null;
  counterpartFormat: RemittanceSourceFormat | null;
  issues: RemittanceCrossVerifyIssue[];
};

type BillFingerprint = {
  key: string;
  section: RemittanceBillSection;
  claimNumber: string;
  icn: string;
  serviceProviderId: string;
  billTotalPayable: number;
  eobCodes: string[];
  serviceLines: RemittanceServiceLine[];
  matchedInvoiceId: string | null;
};

const MONEY_TOLERANCE = 0.01;

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizeServiceLines(value: unknown): RemittanceServiceLine[] {
  if (!Array.isArray(value)) return [];
  return value as RemittanceServiceLine[];
}

function billKey(line: RemittanceLineForCompare): string {
  const dates = normalizeServiceLines(line.serviceLines)
    .map((entry) => entry.serviceDateFrom)
    .sort()
    .join(",");
  const codes = normalizeServiceLines(line.serviceLines)
    .map((entry) => entry.procedureCode)
    .sort()
    .join(",");
  return [
    line.claimNumber.toUpperCase(),
    line.icn.trim(),
    line.serviceProviderId.trim(),
    line.section,
    dates,
    codes,
  ].join("|");
}

function fingerprint(line: RemittanceLineForCompare): BillFingerprint {
  return {
    key: billKey(line),
    section: line.section,
    claimNumber: line.claimNumber,
    icn: line.icn,
    serviceProviderId: line.serviceProviderId,
    billTotalPayable: money(line.billTotalPayable),
    eobCodes: [...line.eobCodes].sort(),
    serviceLines: normalizeServiceLines(line.serviceLines),
    matchedInvoiceId: line.matchedInvoiceId,
  };
}

function compareServiceLines(
  left: RemittanceServiceLine[],
  right: RemittanceServiceLine[],
): boolean {
  if (left.length !== right.length) return false;
  const normalize = (lines: RemittanceServiceLine[]) =>
    [...lines]
      .map((line) => ({
        procedureCode: line.procedureCode,
        serviceDateFrom: line.serviceDateFrom,
        units: line.units,
        payable: money(line.payable),
      }))
      .sort((a, b) =>
        `${a.procedureCode}:${a.serviceDateFrom}`.localeCompare(
          `${b.procedureCode}:${b.serviceDateFrom}`,
        ),
      );

  const leftNorm = normalize(left);
  const rightNorm = normalize(right);
  return leftNorm.every((line, index) => {
    const other = rightNorm[index]!;
    return (
      line.procedureCode === other.procedureCode &&
      line.serviceDateFrom === other.serviceDateFrom &&
      line.units === other.units &&
      Math.abs(line.payable - other.payable) <= MONEY_TOLERANCE
    );
  });
}

export function compareRemittanceAdvices(
  primary: RemittanceAdviceForCompare,
  counterpart: RemittanceAdviceForCompare,
): RemittanceCrossVerifyResult {
  const issues: RemittanceCrossVerifyIssue[] = [];

  if (Math.abs(money(primary.totalPaid) - money(counterpart.totalPaid)) > MONEY_TOLERANCE) {
    issues.push({
      kind: "total_paid",
      message: `Total paid differs (PDF/ERA: ${money(primary.totalPaid)} vs ${money(counterpart.totalPaid)}).`,
    });
  }

  const primaryBills = primary.lines.map(fingerprint);
  const counterpartBills = counterpart.lines.map(fingerprint);
  const counterpartByKey = new Map(counterpartBills.map((bill) => [bill.key, bill]));

  if (primaryBills.length !== counterpartBills.length) {
    issues.push({
      kind: "line_count",
      message: `Bill count differs (${primaryBills.length} vs ${counterpartBills.length}).`,
    });
  }

  for (const bill of primaryBills) {
    const other = counterpartByKey.get(bill.key);
    if (!other) {
      issues.push({
        kind: "missing_bill",
        message: `No matching bill in ${counterpart.sourceFormat === "ERA_835" ? "835 ERA" : "PDF RA"} for claim ${bill.claimNumber} (${bill.section}).`,
      });
      continue;
    }

    if (bill.section !== other.section) {
      issues.push({
        kind: "section",
        message: `Claim ${bill.claimNumber} section differs (${bill.section} vs ${other.section}).`,
      });
    }

    if (Math.abs(bill.billTotalPayable - other.billTotalPayable) > MONEY_TOLERANCE) {
      issues.push({
        kind: "payable",
        message: `Claim ${bill.claimNumber} payable differs (${bill.billTotalPayable} vs ${other.billTotalPayable}).`,
      });
    }

    if (!compareServiceLines(bill.serviceLines, other.serviceLines)) {
      issues.push({
        kind: "service_lines",
        message: `Claim ${bill.claimNumber} service lines differ between sources.`,
      });
    }

    if (
      bill.matchedInvoiceId &&
      other.matchedInvoiceId &&
      bill.matchedInvoiceId !== other.matchedInvoiceId
    ) {
      issues.push({
        kind: "matched_invoice",
        message: `Claim ${bill.claimNumber} matched different invoices between sources.`,
      });
    }
  }

  for (const bill of counterpartBills) {
    if (!primaryBills.some((entry) => entry.key === bill.key)) {
      issues.push({
        kind: "extra_bill",
        message: `Extra bill in ${counterpart.sourceFormat === "ERA_835" ? "835 ERA" : "PDF RA"} for claim ${bill.claimNumber} (${bill.section}).`,
      });
    }
  }

  return {
    status: issues.length === 0 ? "matched" : "mismatched",
    counterpartId: counterpart.id,
    counterpartFormat: counterpart.sourceFormat,
    issues,
  };
}

const remittanceCompareInclude = {
  lines: {
    where: { supersededAt: null },
    select: {
      section: true,
      claimNumber: true,
      icn: true,
      serviceProviderId: true,
      billTotalPayable: true,
      eobCodes: true,
      serviceLines: true,
      matchedInvoiceId: true,
    },
  },
} as const;

export async function findRemittanceCounterpart(
  remittance: Pick<
    RemittanceAdviceForCompare,
    "id" | "remittanceNumber" | "warrantRegister" | "sourceFormat"
  >,
) {
  const targetFormat = remittance.sourceFormat === "PDF_RA" ? "ERA_835" : "PDF_RA";
  return prisma.remittanceAdvice.findFirst({
    where: {
      remittanceNumber: remittance.remittanceNumber,
      warrantRegister: remittance.warrantRegister,
      sourceFormat: targetFormat,
    },
    include: remittanceCompareInclude,
  });
}

export async function verifyRemittanceAgainstCounterpart(
  remittanceId: string,
): Promise<RemittanceCrossVerifyResult> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceId },
    include: remittanceCompareInclude,
  });
  if (!remittance) {
    return {
      status: "missing_counterpart",
      counterpartId: null,
      counterpartFormat: null,
      issues: [{ kind: "missing_bill", message: "Remittance not found." }],
    };
  }

  const counterpart = await findRemittanceCounterpart(remittance);
  if (!counterpart) {
    return {
      status: "missing_counterpart",
      counterpartId: null,
      counterpartFormat: remittance.sourceFormat === "PDF_RA" ? "ERA_835" : "PDF_RA",
      issues: [],
    };
  }

  return compareRemittanceAdvices(remittance, counterpart);
}

export async function loadRemittanceCrossVerifySummaries(
  remittances: RemittanceAdviceForCompare[],
): Promise<Map<string, RemittanceCrossVerifyResult>> {
  if (!remittances.length) return new Map();

  const counterparts = await prisma.remittanceAdvice.findMany({
    where: {
      OR: remittances.map((row) => ({
        remittanceNumber: row.remittanceNumber,
        warrantRegister: row.warrantRegister,
        sourceFormat: row.sourceFormat === "PDF_RA" ? "ERA_835" : "PDF_RA",
      })),
    },
    include: remittanceCompareInclude,
  });

  const counterpartByPair = new Map(
    counterparts.map((row) => [
      `${row.remittanceNumber}::${row.warrantRegister}::${row.sourceFormat}`,
      row,
    ]),
  );

  const results = new Map<string, RemittanceCrossVerifyResult>();
  for (const remittance of remittances) {
    const targetFormat = remittance.sourceFormat === "PDF_RA" ? "ERA_835" : "PDF_RA";
    const counterpart = counterpartByPair.get(
      `${remittance.remittanceNumber}::${remittance.warrantRegister}::${targetFormat}`,
    );
    if (!counterpart) {
      results.set(remittance.id, {
        status: "missing_counterpart",
        counterpartId: null,
        counterpartFormat: targetFormat,
        issues: [],
      });
      continue;
    }

    results.set(remittance.id, compareRemittanceAdvices(remittance, counterpart));
  }

  return results;
}
