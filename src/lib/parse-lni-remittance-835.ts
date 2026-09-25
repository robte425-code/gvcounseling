import { ORG } from "@/lib/constants";
import {
  formatX12DateForRa,
  parseX12,
  parseX12Date,
  parseX12Money,
  splitX12Composite,
  type X12Segment,
} from "@/lib/parse-x12";
import {
  normalizeEobCode,
  normalizeLniProviderId,
  type ParsedRemittanceAdvice,
  type RemittanceBill,
  type RemittanceBillSection,
  type RemittanceServiceLine,
} from "@/lib/parse-lni-remittance-pdf";

const CLAIM_NUMBER = /[A-Z]{2}\d{5,6}/;

type ClaimDraft = {
  section: RemittanceBillSection;
  claimNumber: string;
  patientName: string;
  icn: string;
  serviceProviderId: string;
  serviceProviderNpi: string;
  serviceProviderName: string;
  serviceLines: RemittanceServiceLine[];
  billTotalBilled: number;
  billTotalAllowed: number;
  billTotalNonCovered: number;
  billTotalPayable: number;
  eobCodes: string[];
  /** What CAS segments adjusted away, used to tell a denial from a payment. */
  casAdjustedTotal: number;
  /** CLP02 as sent, kept for the few payers that do use it meaningfully. */
  clpStatus: string;
  /** CLP01, the patient account number we sent — our claim control number. */
  patientAccountNumber: string;
};

function parseRemittanceFilenameIds(filename: string): {
  payeeNumber: string | null;
  warrantRegister: string | null;
} {
  const match = filename.match(/^RemittanceAdvice_(\d+)_(\d+)\.(pdf|835|edi|txt|x12)$/i);
  if (!match) return { payeeNumber: null, warrantRegister: null };
  return { payeeNumber: match[1]!, warrantRegister: match[2]! };
}

/**
 * The section a claim belongs to.
 *
 * CLP02 alone cannot say. L&I stamps every claim in its 835 with status 1,
 * "processed as primary", denials included, so keying on 4 or 22 never fired and
 * every denial was filed as still in process — reported as awaiting a decision
 * when L&I had already refused it and was waiting to be re-billed.
 *
 * What marks a denial is the money: nothing paid, and CAS adjustments writing off
 * the whole charge. Anything actually in process is absent from the 835 entirely
 * — across the three files L&I has sent, every paid and denied bill on the
 * matching PDF appears here and not one of its in-process bills does — so a claim
 * that reaches us with nothing paid has been decided, not deferred.
 */
function resolveSection(
  status: string,
  paymentAmount: number,
  chargeAmount: number,
  casAdjustedTotal: number,
): RemittanceBillSection {
  const code = status.trim();
  if (code === "4" || code === "22") return "DENIED";
  if (paymentAmount > 0) return "PAID";
  if (chargeAmount > 0 && Math.abs(casAdjustedTotal - chargeAmount) < 0.005) return "DENIED";
  return "IN_PROCESS";
}

/** What a CAS segment adjusted away, summed over its reason/amount triplets. */
function parseCasAdjustedAmount(segment: X12Segment): number {
  let total = 0;
  for (let i = 2; i < segment.elements.length; i += 3) {
    total += parseX12Money(segment.elements[i]);
  }
  return Math.round(total * 100) / 100;
}

function extractClaimNumberFromSegments(segments: string[]): string | null {
  for (const value of segments) {
    const match = value.toUpperCase().match(CLAIM_NUMBER);
    if (match) return match[0]!;
  }
  return null;
}

function parseCasEobCodes(segment: X12Segment): string[] {
  const codes: string[] = [];
  for (let i = 1; i < segment.elements.length; i += 3) {
    const code = segment.elements[i];
    if (code) codes.push(normalizeEobCode(code));
  }
  return codes;
}

const PLACEHOLDER_SERVICE_DATE = "1970-01-01";

/** Service-date qualifiers commonly used on 835 SVC loops (DTM follows SVC). */
function isServiceDateQualifier(qualifier: string): boolean {
  return qualifier === "472" || qualifier === "150" || qualifier === "151";
}

function applyServiceDateFrom(line: RemittanceServiceLine, iso: string): void {
  const previousFrom = line.serviceDateFrom;
  line.serviceDateFrom = iso;
  if (
    line.serviceDateTo === PLACEHOLDER_SERVICE_DATE ||
    line.serviceDateTo === previousFrom
  ) {
    line.serviceDateTo = iso;
  }
}

function applyServiceDateTo(line: RemittanceServiceLine, iso: string): void {
  line.serviceDateTo = iso;
  if (line.serviceDateFrom === PLACEHOLDER_SERVICE_DATE) {
    line.serviceDateFrom = iso;
  }
}

function parseSvcLine(
  segment: X12Segment,
  componentSeparator: string,
  serviceDate: string | null,
  eobCodes: string[],
): RemittanceServiceLine {
  const composite = splitX12Composite(segment.elements[0] ?? "", componentSeparator);
  const procedureCode = (composite[1] ?? composite[0] ?? "").replace(/^HC:?/i, "");
  const billed = parseX12Money(segment.elements[1]);
  const payable = parseX12Money(segment.elements[2]);
  const units = Number.parseFloat(segment.elements[4] ?? segment.elements[3] ?? "1");
  const dos = serviceDate ?? PLACEHOLDER_SERVICE_DATE;

  return {
    serviceDateFrom: dos,
    serviceDateTo: dos,
    units: Number.isFinite(units) && units > 0 ? units : 1,
    procedureCode,
    billed,
    allowed: billed,
    nonCovered: Math.max(0, Math.round((billed - payable) * 100) / 100),
    payable,
    eobCode: eobCodes[0],
  };
}

function finalizeClaimDraft(draft: ClaimDraft): RemittanceBill {
  const billed = draft.serviceLines.reduce((sum, line) => sum + line.billed, 0);
  const allowed = draft.serviceLines.reduce((sum, line) => sum + line.allowed, 0);
  const nonCovered = draft.serviceLines.reduce((sum, line) => sum + line.nonCovered, 0);
  const payable = draft.serviceLines.reduce((sum, line) => sum + line.payable, 0);

  return {
    patientAccountNumber: draft.patientAccountNumber,
    // Decided here rather than at CLP, because it depends on the CAS segments
    // that follow it.
    section: resolveSection(
      draft.clpStatus,
      payable || draft.billTotalPayable,
      billed || draft.billTotalBilled,
      draft.casAdjustedTotal,
    ),
    claimNumber: draft.claimNumber,
    patientName: draft.patientName,
    icn: draft.icn,
    serviceProviderId: draft.serviceProviderId,
    serviceProviderNpi: draft.serviceProviderNpi,
    serviceProviderName: draft.serviceProviderName,
    serviceLines: draft.serviceLines,
    billTotalBilled: billed || draft.billTotalBilled,
    billTotalAllowed: allowed || draft.billTotalAllowed,
    billTotalNonCovered: nonCovered || draft.billTotalNonCovered,
    billTotalPayable: payable || draft.billTotalPayable,
    eobCodes: [...new Set(draft.eobCodes)],
  };
}

function emptyClaimDraft(): ClaimDraft {
  return {
    section: "IN_PROCESS",
    casAdjustedTotal: 0,
    clpStatus: "",
    patientAccountNumber: "",
    claimNumber: "",
    patientName: "",
    icn: "",
    serviceProviderId: "",
    serviceProviderNpi: "",
    serviceProviderName: "",
    serviceLines: [],
    billTotalBilled: 0,
    billTotalAllowed: 0,
    billTotalNonCovered: 0,
    billTotalPayable: 0,
    eobCodes: [],
  };
}

function parse835Claims(
  segments: X12Segment[],
  componentSeparator: string,
): RemittanceBill[] {
  const bills: RemittanceBill[] = [];
  let draft: ClaimDraft | null = null;
  /** DTM service date seen before any SVC on this claim (safe to seed every SVC). */
  let claimLevelServiceDate: string | null = null;
  let pendingEobCodes: string[] = [];

  const flush = () => {
    if (!draft) return;
    if (!draft.claimNumber) {
      draft = null;
      claimLevelServiceDate = null;
      pendingEobCodes = [];
      return;
    }
    if (!draft.serviceLines.length && draft.billTotalPayable > 0) {
      const dos = claimLevelServiceDate ?? PLACEHOLDER_SERVICE_DATE;
      draft.serviceLines.push({
        serviceDateFrom: dos,
        serviceDateTo: dos,
        units: 1,
        procedureCode: "UNKNOWN",
        billed: draft.billTotalBilled,
        allowed: draft.billTotalAllowed,
        nonCovered: draft.billTotalNonCovered,
        payable: draft.billTotalPayable,
        eobCode: draft.eobCodes[0],
      });
    } else if (claimLevelServiceDate) {
      // Only backfill from a true claim-level DTM (before any SVC), never from a later SVC's DTM.
      for (const line of draft.serviceLines) {
        if (line.serviceDateFrom === PLACEHOLDER_SERVICE_DATE) {
          applyServiceDateFrom(line, claimLevelServiceDate);
        }
      }
    }
    bills.push(finalizeClaimDraft(draft));
    draft = null;
    claimLevelServiceDate = null;
    pendingEobCodes = [];
  };

  for (const segment of segments) {
    switch (segment.id) {
      case "CLP": {
        flush();
        const paymentAmount = parseX12Money(segment.elements[3]);
        draft = {
          ...emptyClaimDraft(),
          // Provisional: revised once the claim's CAS segments have been read.
          clpStatus: segment.elements[1] ?? "",
          patientAccountNumber: (segment.elements[0] ?? "").trim().toUpperCase(),
          section: paymentAmount > 0 ? "PAID" : "IN_PROCESS",
          claimNumber:
            extractClaimNumberFromSegments([
              segment.elements[0] ?? "",
              segment.elements[6] ?? "",
            ]) ?? "",
          icn: segment.elements[6]?.trim() ?? "",
          billTotalBilled: parseX12Money(segment.elements[2]),
          billTotalAllowed: parseX12Money(segment.elements[2]),
          billTotalPayable: paymentAmount,
          billTotalNonCovered: Math.max(
            0,
            Math.round((parseX12Money(segment.elements[2]) - paymentAmount) * 100) / 100,
          ),
        };
        break;
      }
      case "CAS": {
        if (!draft) break;
        const codes = parseCasEobCodes(segment);
        draft.eobCodes.push(...codes);
        draft.casAdjustedTotal = Math.round((draft.casAdjustedTotal + parseCasAdjustedAmount(segment)) * 100) / 100;
        pendingEobCodes = codes;
        break;
      }
      case "NM1": {
        if (!draft) break;
        const qualifier = segment.elements[0] ?? "";
        const lastName = segment.elements[2] ?? "";
        const firstName = segment.elements[3] ?? "";
        const idQualifier = segment.elements[7] ?? "";
        const idValue = segment.elements[8] ?? "";

        if (qualifier === "QC" || qualifier === "IL") {
          if (!draft.patientName) {
            draft.patientName = `${firstName} ${lastName}`.trim();
          }
          if (idQualifier === "MI" && CLAIM_NUMBER.test(idValue.toUpperCase())) {
            draft.claimNumber = idValue.toUpperCase();
          }
        }

        if (qualifier === "82") {
          draft.serviceProviderName = `${firstName} ${lastName}`.trim();
          if (idQualifier === "XX") {
            draft.serviceProviderNpi = idValue;
          }
        }
        break;
      }
      case "REF": {
        const refValue = segment.elements[1] ?? "";
        const qualifier = segment.elements[0] ?? "";
        if (draft) {
          if (qualifier === "G2" && refValue) {
            draft.serviceProviderId = normalizeLniProviderId(refValue);
          }
          if (!draft.claimNumber && CLAIM_NUMBER.test(refValue.toUpperCase())) {
            draft.claimNumber = refValue.toUpperCase();
          }
        }
        break;
      }
      case "SVC": {
        if (!draft) break;
        // Seed from claim-level DTM only; post-SVC DTM*472 overwrites this line next.
        draft.serviceLines.push(
          parseSvcLine(segment, componentSeparator, claimLevelServiceDate, pendingEobCodes),
        );
        pendingEobCodes = [];
        break;
      }
      case "DTM": {
        const qualifier = segment.elements[0] ?? "";
        const iso = parseX12Date(segment.elements[1]);
        if (!iso || !draft) break;
        if (!isServiceDateQualifier(qualifier)) break;

        const lastLine = draft.serviceLines[draft.serviceLines.length - 1];
        if (!lastLine) {
          // Claim-level date before any SVC — safe to seed every subsequent SVC.
          if (qualifier === "472" || qualifier === "150") {
            claimLevelServiceDate = iso;
          } else if (qualifier === "151" && !claimLevelServiceDate) {
            claimLevelServiceDate = iso;
          }
          break;
        }

        // Standard 835 order is SVC then DTM — attach DOS to the latest service line only.
        if (qualifier === "472" || qualifier === "150") {
          applyServiceDateFrom(lastLine, iso);
        } else if (qualifier === "151") {
          applyServiceDateTo(lastLine, iso);
        }
        break;
      }
      default:
        break;
    }
  }

  flush();
  return bills;
}

function extractHeaderFields(
  segments: X12Segment[],
  sourceFilename: string,
): Pick<
  ParsedRemittanceAdvice,
  | "remittanceNumber"
  | "warrantRegister"
  | "invoiceDate"
  | "reportDate"
  | "payeeNumber"
  | "payeeName"
  | "totalPaid"
> {
  const filenameIds = parseRemittanceFilenameIds(sourceFilename);
  let remittanceNumber = "";
  let warrantRegister = filenameIds.warrantRegister ?? "";
  let invoiceDate = "";
  let reportDate: string | null = null;
  let payeeNumber = filenameIds.payeeNumber ?? normalizeLniProviderId(ORG.lniProviderId);
  let payeeName: string = ORG.name;
  let totalPaid = 0;

  for (const segment of segments) {
    if (segment.id === "BPR") {
      totalPaid = parseX12Money(segment.elements[1]);
      const paymentDate = parseX12Date(segment.elements[15]);
      if (paymentDate) invoiceDate = formatX12DateForRa(paymentDate);
    }
    if (segment.id === "TRN") {
      if (!warrantRegister) warrantRegister = segment.elements[1]?.trim() ?? "";
      if (!remittanceNumber && segment.elements[1]) {
        remittanceNumber = segment.elements[1]!.replace(/\D/g, "");
      }
    }
    if (segment.id === "REF") {
      const qualifier = segment.elements[0] ?? "";
      const value = segment.elements[1]?.trim() ?? "";
      if (qualifier === "EV" && value) remittanceNumber = value.replace(/\D/g, "");
      if (qualifier === "6R" && value) warrantRegister = value.replace(/\D/g, "");
      if (qualifier === "G2" && value) payeeNumber = normalizeLniProviderId(value);
    }
    if (segment.id === "DTM") {
      const qualifier = segment.elements[0] ?? "";
      const iso = parseX12Date(segment.elements[1]);
      if (!iso) continue;
      if (qualifier === "405" && !invoiceDate) invoiceDate = formatX12DateForRa(iso);
      if (qualifier === "232") reportDate = formatX12DateForRa(iso);
    }
    if (segment.id === "N1" && segment.elements[0] === "PE") {
      payeeName = segment.elements[1]?.trim() || payeeName;
    }
  }

  if (!remittanceNumber && warrantRegister) {
    remittanceNumber = warrantRegister;
  }
  if (!warrantRegister && remittanceNumber) {
    warrantRegister = remittanceNumber;
  }

  if (!remittanceNumber) {
    throw new Error("Could not find remittance advice number in 835 (REF*EV or TRN).");
  }
  if (!warrantRegister) {
    throw new Error("Could not find warrant register / trace number in 835 (TRN or REF*6R).");
  }
  if (!invoiceDate) {
    throw new Error("Could not find payment date in 835 (BPR or DTM*405).");
  }

  return {
    remittanceNumber,
    warrantRegister,
    invoiceDate,
    reportDate,
    payeeNumber,
    payeeName,
    totalPaid,
  };
}

export function parseLniRemittance835Text(
  content: string,
  options?: { sourceFilename?: string },
): ParsedRemittanceAdvice {
  const parsed = parseX12(content);
  const header = extractHeaderFields(parsed.segments, options?.sourceFilename ?? "");
  const bills = parse835Claims(parsed.segments, parsed.componentSeparator);

  if (!bills.length) {
    throw new Error("No claim payment loops found in 835 file.");
  }

  const eobCodeDescriptions: Record<string, string> = {};
  for (const bill of bills) {
    for (const code of bill.eobCodes) {
      if (!eobCodeDescriptions[code]) {
        eobCodeDescriptions[code] = `HIPAA adjustment code ${code}`;
      }
    }
    for (const line of bill.serviceLines) {
      if (line.eobCode && !eobCodeDescriptions[line.eobCode]) {
        eobCodeDescriptions[line.eobCode] = `HIPAA adjustment code ${line.eobCode}`;
      }
    }
  }

  return {
    ...header,
    bills,
    eobCodeDescriptions,
  };
}

export function parseLniRemittance835(
  buffer: Buffer,
  options?: { sourceFilename?: string },
): ParsedRemittanceAdvice {
  const content = buffer.toString("utf8").replace(/^\uFEFF/, "");
  return parseLniRemittance835Text(content, options);
}
