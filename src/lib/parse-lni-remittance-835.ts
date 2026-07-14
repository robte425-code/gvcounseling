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
};

function parseRemittanceFilenameIds(filename: string): {
  payeeNumber: string | null;
  warrantRegister: string | null;
} {
  const match = filename.match(/^RemittanceAdvice_(\d+)_(\d+)\.(pdf|835|edi|txt|x12)$/i);
  if (!match) return { payeeNumber: null, warrantRegister: null };
  return { payeeNumber: match[1]!, warrantRegister: match[2]! };
}

function clpStatusToSection(status: string, paymentAmount: number): RemittanceBillSection {
  const code = status.trim();
  if (code === "4" || code === "22") return "DENIED";
  if (paymentAmount > 0) return "PAID";
  if (code === "1" || code === "2" || code === "3" || code === "19" || code === "20" || code === "21") {
    return paymentAmount > 0 ? "PAID" : "IN_PROCESS";
  }
  return "IN_PROCESS";
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

  return {
    serviceDateFrom: serviceDate ?? "1970-01-01",
    serviceDateTo: serviceDate ?? "1970-01-01",
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
    section: draft.section,
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
  let pendingServiceDate: string | null = null;
  let pendingEobCodes: string[] = [];

  const flush = () => {
    if (!draft) return;
    if (!draft.claimNumber) {
      draft = null;
      pendingServiceDate = null;
      pendingEobCodes = [];
      return;
    }
    if (!draft.serviceLines.length && draft.billTotalPayable > 0) {
      draft.serviceLines.push({
        serviceDateFrom: pendingServiceDate ?? "1970-01-01",
        serviceDateTo: pendingServiceDate ?? "1970-01-01",
        units: 1,
        procedureCode: "UNKNOWN",
        billed: draft.billTotalBilled,
        allowed: draft.billTotalAllowed,
        nonCovered: draft.billTotalNonCovered,
        payable: draft.billTotalPayable,
        eobCode: draft.eobCodes[0],
      });
    }
    bills.push(finalizeClaimDraft(draft));
    draft = null;
    pendingServiceDate = null;
    pendingEobCodes = [];
  };

  for (const segment of segments) {
    switch (segment.id) {
      case "CLP": {
        flush();
        const paymentAmount = parseX12Money(segment.elements[3]);
        draft = {
          ...emptyClaimDraft(),
          section: clpStatusToSection(segment.elements[1] ?? "", paymentAmount),
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
        draft.serviceLines.push(
          parseSvcLine(segment, componentSeparator, pendingServiceDate, pendingEobCodes),
        );
        break;
      }
      case "DTM": {
        const qualifier = segment.elements[0] ?? "";
        const iso = parseX12Date(segment.elements[1]);
        if (!iso) break;
        if (qualifier === "472") {
          pendingServiceDate = iso;
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
