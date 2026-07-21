import { parseX12, parseX12Date, type X12Segment } from "@/lib/parse-x12";

export type Edi999AcknowledgmentCode = "A" | "E" | "P" | "R" | "M" | "W" | "X" | string;

export type Edi999ElementError = {
  elementPosition: string | null;
  dataElementReference: string | null;
  errorCode: string | null;
  badValue: string | null;
  explanation: string;
};

export type Edi999SegmentError = {
  segmentId: string | null;
  segmentPosition: string | null;
  loopId: string | null;
  errorCode: string | null;
  explanation: string;
  elementErrors: Edi999ElementError[];
  contextNotes: string[];
};

export type Edi999ValidationResult = {
  accepted: boolean;
  summary: string;
  interchangeSender: string | null;
  interchangeReceiver: string | null;
  interchangeDate: string | null;
  functionalGroupCode: string | null;
  acknowledgedTransactionSetId: string | null;
  acknowledgedControlNumber: string | null;
  transactionSetStatus: Edi999AcknowledgmentCode | null;
  transactionSetStatusLabel: string;
  functionalGroupStatus: Edi999AcknowledgmentCode | null;
  functionalGroupStatusLabel: string;
  transactionSetsIncluded: number | null;
  transactionSetsReceived: number | null;
  transactionSetsAccepted: number | null;
  segmentErrorCount: number;
  elementErrorCount: number;
  segmentErrors: Edi999SegmentError[];
  knownIssueHints: string[];
};

const ACK_LABELS: Record<string, string> = {
  A: "Accepted",
  E: "Accepted with errors",
  P: "Partially accepted",
  R: "Rejected",
  M: "Rejected — message authentication failed",
  W: "Rejected — assurance failed",
  X: "Rejected — content after decryption failed",
};

const IK3_ERROR_LABELS: Record<string, string> = {
  "1": "Unrecognized segment ID",
  "2": "Unexpected segment",
  "3": "Required segment missing",
  "4": "Loop occurs over maximum times",
  "5": "Segment exceeds maximum use",
  "6": "Segment not in defined transaction set",
  "7": "Segment not in proper sequence",
  "8": "Segment has data element errors",
};

const IK4_ERROR_LABELS: Record<string, string> = {
  "1": "Required data element missing",
  "2": "Conditional required data element missing",
  "3": "Too many data elements",
  "4": "Data element too short",
  "5": "Data element too long",
  "6": "Invalid character in data element",
  "7": "Invalid code value",
  "8": "Invalid date",
  "9": "Invalid time",
  "10": "Exclusion of conditional data",
  "12": "Too many repetitions",
  "13": "Too many components",
  I6: "Code value not used in this implementation",
  I9: "Implementation-dependent data element missing",
  I10: "Implementation “Not Used” data element present",
  I11: "Too many repetitions",
  I12: "Implementation “Not Used” data element present",
  I13: "Implementation dependent data element missing",
};

function el(segment: X12Segment | undefined, index: number): string | null {
  const value = segment?.elements[index - 1]?.trim();
  return value ? value : null;
}

function ackLabel(code: string | null): string {
  if (!code) return "Unknown";
  return ACK_LABELS[code] ?? `Status ${code}`;
}

function ik3Explanation(code: string | null): string {
  if (!code) return "Segment-level error";
  return IK3_ERROR_LABELS[code] ?? `Segment error code ${code}`;
}

function ik4Explanation(code: string | null): string {
  if (!code) return "Element-level error";
  return IK4_ERROR_LABELS[code] ?? `Element error code ${code}`;
}

function collectKnownIssueHints(errors: Edi999SegmentError[]): string[] {
  const hints: string[] = [];
  const hasRenderingRefG2 = errors.some(
    (error) =>
      error.segmentId === "REF" &&
      error.loopId === "2310" &&
      error.elementErrors.some(
        (elErr) =>
          elErr.badValue === "G2" &&
          (elErr.errorCode === "I12" || elErr.errorCode === "I10"),
      ),
  );
  if (hasRenderingRefG2) {
    hints.push(
      "Rendering-provider REF*G2 was rejected while NM1*82 already has an NPI — omit that REF in loop 2310.",
    );
  }

  const hasNm1Shift = errors.some(
    (error) =>
      error.segmentId === "NM1" &&
      error.elementErrors.some(
        (elErr) =>
          elErr.elementPosition === "7" ||
          elErr.elementPosition === "8" ||
          elErr.elementPosition === "9",
      ),
  );
  if (hasNm1Shift) {
    hints.push(
      "NM1 ID qualifier/ID may be in the wrong element positions (NM108/NM109).",
    );
  }

  const hasSbrWc = errors.some(
    (error) =>
      error.segmentId === "SBR" &&
      error.elementErrors.some((elErr) => elErr.badValue === "WC"),
  );
  if (hasSbrWc) {
    hints.push("SBR claim-filing indicator WC may be in SBR08 instead of SBR09.");
  }

  return hints;
}

/**
 * Parse and validate an L&I (or other payer) X12 999 Functional Acknowledgment.
 */
export function validateEdi999(content: string): Edi999ValidationResult {
  const parsed = parseX12(content, { requireTransactionSet: "999" });
  const { segments } = parsed;

  const isa = segments.find((segment) => segment.id === "ISA");
  const gs = segments.find((segment) => segment.id === "GS");
  const ak1 = segments.find((segment) => segment.id === "AK1");
  const ak2 = segments.find((segment) => segment.id === "AK2");
  const ik5 = segments.find((segment) => segment.id === "IK5");
  const ak9 = segments.find((segment) => segment.id === "AK9");

  const segmentErrors: Edi999SegmentError[] = [];
  let current: Edi999SegmentError | null = null;

  for (const segment of segments) {
    if (segment.id === "IK3") {
      if (current) segmentErrors.push(current);
      current = {
        segmentId: el(segment, 1),
        segmentPosition: el(segment, 2),
        loopId: el(segment, 3),
        errorCode: el(segment, 4),
        explanation: ik3Explanation(el(segment, 4)),
        elementErrors: [],
        contextNotes: [],
      };
      continue;
    }

    if (!current) continue;

    if (segment.id === "IK4") {
      const errorCode = el(segment, 3);
      current.elementErrors.push({
        elementPosition: el(segment, 1),
        dataElementReference: el(segment, 2),
        errorCode,
        badValue: el(segment, 4),
        explanation: ik4Explanation(errorCode),
      });
      continue;
    }

    if (segment.id === "CTX") {
      const note = segment.elements.filter(Boolean).join("*");
      if (note) current.contextNotes.push(note);
      continue;
    }

    if (segment.id === "IK5" || segment.id === "AK9" || segment.id === "AK2") {
      segmentErrors.push(current);
      current = null;
    }
  }
  if (current) segmentErrors.push(current);

  const transactionSetStatus = el(ik5, 1);
  const functionalGroupStatus = el(ak9, 1);
  const transactionSetsIncluded = el(ak9, 2) ? Number(el(ak9, 2)) : null;
  const transactionSetsReceived = el(ak9, 3) ? Number(el(ak9, 3)) : null;
  const transactionSetsAccepted = el(ak9, 4) ? Number(el(ak9, 4)) : null;

  const accepted =
    (transactionSetStatus === "A" || transactionSetStatus === "E") &&
    (functionalGroupStatus === "A" || functionalGroupStatus === "E") &&
    (transactionSetsAccepted == null || transactionSetsAccepted > 0) &&
    segmentErrors.length === 0;

  const acceptedLoose =
    (transactionSetStatus === "A" || transactionSetStatus === "E") &&
    (functionalGroupStatus === "A" ||
      functionalGroupStatus === "E" ||
      functionalGroupStatus === "P") &&
    (transactionSetsAccepted ?? 0) > 0;

  const fullyAccepted = accepted || (acceptedLoose && transactionSetStatus === "A" && segmentErrors.length === 0);

  let summary: string;
  if (fullyAccepted) {
    summary =
      transactionSetsAccepted != null
        ? `Accepted — ${transactionSetsAccepted} of ${transactionSetsReceived ?? transactionSetsAccepted} transaction set(s) accepted with no segment errors.`
        : "Accepted — no segment errors reported.";
  } else if (transactionSetStatus === "R" || functionalGroupStatus === "R") {
    summary = `Rejected — ${segmentErrors.length} segment error group(s); ${transactionSetsAccepted ?? 0} transaction set(s) accepted.`;
  } else if (segmentErrors.length > 0) {
    summary = `Accepted with errors — ${segmentErrors.length} segment error group(s).`;
  } else {
    summary = `Status ${ackLabel(transactionSetStatus)} / group ${ackLabel(functionalGroupStatus)}.`;
  }

  const elementErrorCount = segmentErrors.reduce(
    (sum, error) => sum + error.elementErrors.length,
    0,
  );

  return {
    accepted: fullyAccepted,
    summary,
    interchangeSender: el(isa, 6),
    interchangeReceiver: el(isa, 8),
    interchangeDate: parseX12Date(
      (el(isa, 9)?.length === 6 ? el(isa, 9) : el(gs, 4)) ?? undefined,
    ),
    functionalGroupCode: el(ak1, 1) ?? el(gs, 1),
    acknowledgedTransactionSetId: el(ak2, 1),
    acknowledgedControlNumber: el(ak2, 2),
    transactionSetStatus,
    transactionSetStatusLabel: ackLabel(transactionSetStatus),
    functionalGroupStatus,
    functionalGroupStatusLabel: ackLabel(functionalGroupStatus),
    transactionSetsIncluded,
    transactionSetsReceived,
    transactionSetsAccepted,
    segmentErrorCount: segmentErrors.length,
    elementErrorCount,
    segmentErrors,
    knownIssueHints: collectKnownIssueHints(segmentErrors),
  };
}
