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

/**
 * A bill's identity across the two formats: L&I's own claim control number.
 *
 * The key used to fold in the claim number, service provider id, section, service
 * dates and EOB codes. The two formats state none of those the same way — the
 * provider id is padded differently (0480003 against 0000480003), the 835 reports
 * no service lines for a bill it paid nothing on, and the codes come from
 * different vocabularies entirely, L&I's own 259 against the HIPAA 140. So no bill
 * ever matched its own counterpart, and every one was reported as both missing
 * from one side and extra on the other. The ICN is L&I's, identifies the bill, and
 * both formats carry it verbatim.
 */
function billKey(line: RemittanceLineForCompare): string {
  return line.icn.trim().toUpperCase();
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
        message: `No matching bill in ${counterpart.sourceFormat === "ERA_835" ? "835 ERA" : "PDF RA"} for bill ${bill.icn} (${bill.section}).`,
      });
      continue;
    }

    if (bill.section !== other.section) {
      issues.push({
        kind: "section",
        message: `Bill ${bill.icn} section differs (${bill.section} vs ${other.section}).`,
      });
    }

    if (Math.abs(bill.billTotalPayable - other.billTotalPayable) > MONEY_TOLERANCE) {
      issues.push({
        kind: "payable",
        message: `Bill ${bill.icn} payable differs (${bill.billTotalPayable} vs ${other.billTotalPayable}).`,
      });
    }

    // Only where both sides itemise. An 835 lists no service lines for a bill it
    // paid nothing on, while the PDF itemises all of them at zero, and calling
    // that a discrepancy buried the real ones.
    if (
      bill.serviceLines.length > 0 &&
      other.serviceLines.length > 0 &&
      !compareServiceLines(bill.serviceLines, other.serviceLines)
    ) {
      issues.push({
        kind: "service_lines",
        message: `Bill ${bill.icn} service lines differ between sources.`,
      });
    }

    if (
      bill.matchedInvoiceId &&
      other.matchedInvoiceId &&
      bill.matchedInvoiceId !== other.matchedInvoiceId
    ) {
      issues.push({
        kind: "matched_invoice",
        message: `Bill ${bill.icn} matched different invoices between sources.`,
      });
    }
  }

  for (const bill of counterpartBills) {
    if (!primaryBills.some((entry) => entry.key === bill.key)) {
      issues.push({
        kind: "extra_bill",
        message: `Extra bill in ${counterpart.sourceFormat === "ERA_835" ? "835 ERA" : "PDF RA"} for bill ${bill.icn} (${bill.section}).`,
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

/**
 * The same remittance in the other format, for one remittance.
 *
 * Narrowed by the bills this one reports, then settled by the same overlap rule
 * findCounterpart uses, so the page for a single remittance and the list agree.
 */
export async function findRemittanceCounterpart(
  remittance: Pick<RemittanceAdviceForCompare, "id" | "sourceFormat" | "lines">,
) {
  const targetFormat = remittance.sourceFormat === "PDF_RA" ? "ERA_835" : "PDF_RA";
  const icns = [...icnsOf(remittance)];
  if (!icns.length) return null;

  const candidates = await prisma.remittanceAdvice.findMany({
    where: {
      sourceFormat: targetFormat,
      lines: { some: { icn: { in: icns }, supersededAt: null } },
    },
    include: remittanceCompareInclude,
  });

  return findCounterpart(remittance, candidates);
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

/** The bills a remittance reports, by L&I's own claim control number. */
function icnsOf(remittance: Pick<RemittanceAdviceForCompare, "lines">): Set<string> {
  const icns = new Set<string>();
  for (const line of remittance.lines) {
    const icn = line.icn.trim();
    if (icn) icns.add(icn);
  }
  return icns;
}

/**
 * The same remittance in the other format, found by the bills the two report.
 *
 * Pairing used to be on remittance number and warrant register, which the two
 * formats do not share. A PDF carries L&I's own "REMITTANCE ADVICE: 108125" and
 * "WARRANT REGISTER: 60938"; an 835 carries neither, so the parser fell back to
 * the payee number and the EFT trace from TRN02 — 0479998 and 169417!. Those can
 * never equal 108125 and 60938, so every remittance reported a missing
 * counterpart and the comparison silently never ran on anything.
 *
 * ICNs are the one identifier both formats state per bill, and they are L&I's, not
 * ours. A bill is re-reported on later remittances as it moves from in process to
 * settled, so sharing one ICN proves nothing; the pair has to share more than half
 * of whichever side lists fewer bills, and the best overlap wins.
 */
type Pairable = Pick<RemittanceAdviceForCompare, "id" | "sourceFormat" | "lines">;

function findCounterpart<T extends Pairable>(remittance: Pairable, all: T[]): T | null {
  const wanted = remittance.sourceFormat === "PDF_RA" ? "ERA_835" : "PDF_RA";
  const mine = icnsOf(remittance);
  if (!mine.size) return null;

  let best: T | null = null;
  let bestOverlap = 0;
  let bestSmaller = 0;

  for (const other of all) {
    if (other.id === remittance.id || other.sourceFormat !== wanted) continue;
    const theirs = icnsOf(other);
    if (!theirs.size) continue;

    let overlap = 0;
    for (const icn of theirs) {
      if (mine.has(icn)) overlap += 1;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = other;
      bestSmaller = Math.min(mine.size, theirs.size);
    }
  }

  if (!best || bestOverlap * 2 <= bestSmaller) return null;
  return best;
}

/**
 * Compare every remittance against its counterpart in the other format.
 *
 * Counterparts are found within the set handed in, which is every remittance the
 * page already loaded, so this costs no further queries.
 */
export function loadRemittanceCrossVerifySummaries(
  remittances: RemittanceAdviceForCompare[],
): Map<string, RemittanceCrossVerifyResult> {
  const results = new Map<string, RemittanceCrossVerifyResult>();

  for (const remittance of remittances) {
    const counterpartFormat = remittance.sourceFormat === "PDF_RA" ? "ERA_835" : "PDF_RA";
    const counterpart = findCounterpart(remittance, remittances);
    results.set(
      remittance.id,
      counterpart
        ? compareRemittanceAdvices(remittance, counterpart)
        : { status: "missing_counterpart", counterpartId: null, counterpartFormat, issues: [] },
    );
  }

  return results;
}
