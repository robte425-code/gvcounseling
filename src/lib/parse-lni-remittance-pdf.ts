export type RemittanceBillSection = "PAID" | "DENIED" | "IN_PROCESS";

export type RemittanceServiceLine = {
  serviceDateFrom: string;
  serviceDateTo: string;
  units: number;
  procedureCode: string;
  billed: number;
  allowed: number;
  nonCovered: number;
  payable: number;
  eobCode?: string;
};

export type RemittanceBill = {
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

export type ParsedRemittanceAdvice = {
  remittanceNumber: string;
  warrantRegister: string;
  invoiceDate: string;
  reportDate: string | null;
  payeeNumber: string;
  payeeName: string;
  totalPaid: number;
  bills: RemittanceBill[];
  eobCodeDescriptions: Record<string, string>;
};

const CLAIM_NUMBER = /[A-Z]{2}\d{5,6}/;
const EOB_CODE = /(\d{3}|P\d{2})/i;
const EOB_CODE_SUFFIX = `(?:\\s+(${EOB_CODE.source}))(?![\\d.])`;

const SERVICE_LINE =
  new RegExp(
    `(\\d{6})\\s+(\\d{6})\\s+([\\d.]+)\\s+(\\w+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)${EOB_CODE_SUFFIX}?`,
    "g",
  );

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Normalize L&I provider id for comparison (0480003 ↔ 480003). */
export function normalizeLniProviderId(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.padStart(7, "0");
}

function parseMoney(value: string): number {
  return Number.parseFloat(value.replace(/,/g, ""));
}

function parseServiceDate(mmddyy: string): string {
  const month = mmddyy.slice(0, 2);
  const day = mmddyy.slice(2, 4);
  const yearSuffix = Number.parseInt(mmddyy.slice(4, 6), 10);
  const year = yearSuffix >= 70 ? 1900 + yearSuffix : 2000 + yearSuffix;
  return `${year}-${month}-${day}`;
}

function parseServiceLineMatch(match: RegExpExecArray): RemittanceServiceLine {
  return {
    serviceDateFrom: parseServiceDate(match[1]!),
    serviceDateTo: parseServiceDate(match[2]!),
    units: Number.parseFloat(match[3]!),
    procedureCode: match[4]!,
    billed: parseMoney(match[5]!),
    allowed: parseMoney(match[6]!),
    nonCovered: parseMoney(match[7]!),
    payable: parseMoney(match[8]!),
    eobCode: match[9] ? normalizeEobCode(match[9]) : undefined,
  };
}

function extractEobDescriptions(text: string): Record<string, string> {
  const descriptions: Record<string, string> = {};
  const marker = text.search(
    /THE FOLLOWING IS A DESCRIPTION OF THE EXPLANATION CODES UTILIZED ABOVE:/i,
  );
  if (marker < 0) return descriptions;

  const afterMarker = text.slice(marker);
  const end = afterMarker.search(/PAYMENTS AND PAYMENT DENIALS|WASHINGTON STATE DEPARTMENT/i);
  const block = end >= 0 ? afterMarker.slice(0, end) : afterMarker;

  const pattern = /(\d{3}|P\d{2})\s+(.+?)(?=(?:\s(?:\d{3}|P\d{2})\s+[A-Z]|\s*$))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block)) !== null) {
    descriptions[match[1]!.toUpperCase()] = match[2]!.trim();
  }
  return descriptions;
}

export function normalizeEobCode(code: string): string {
  return code.toUpperCase();
}

export function isEobCode(value: string): boolean {
  const normalized = normalizeEobCode(value);
  return /^\d{3}$/.test(normalized) || /^P\d{2}$/.test(normalized);
}

export function resolveEobDescriptions(
  codes: string[],
  catalog: Record<string, string>,
): Record<string, string> {
  const descriptions: Record<string, string> = {};
  for (const code of codes) {
    const normalized = normalizeEobCode(code);
    const description = catalog[normalized] ?? catalog[code];
    if (description) descriptions[normalized] = description;
  }
  return descriptions;
}

function parseBillTotal(text: string): {
  billed: number;
  allowed: number;
  nonCovered: number;
  payable: number;
} | null {
  const match = text.match(
    /\*\*\*BILL TOTAL \. \. \.\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/,
  );
  if (!match) return null;
  return {
    billed: parseMoney(match[1]!),
    allowed: parseMoney(match[2]!),
    nonCovered: parseMoney(match[3]!),
    payable: parseMoney(match[4]!),
  };
}

function parseServiceLineFromClaimRow(match: RegExpMatchArray): RemittanceServiceLine {
  return {
    serviceDateFrom: parseServiceDate(match[3]!),
    serviceDateTo: parseServiceDate(match[4]!),
    units: Number.parseFloat(match[5]!),
    procedureCode: match[6]!,
    billed: parseMoney(match[7]!),
    allowed: parseMoney(match[8]!),
    nonCovered: parseMoney(match[9]!),
    payable: parseMoney(match[10]!),
    eobCode: match[11] ? normalizeEobCode(match[11]) : undefined,
  };
}

function extractEobAfterBillTotal(patAndTotal: string): string | undefined {
  const match = patAndTotal.match(
    new RegExp(
      `\\*\\*\\*BILL TOTAL \\. \\. \\.\\s+[\\d.]+\\s+[\\d.]+\\s+[\\d.]+\\s+[\\d.]+${EOB_CODE_SUFFIX}(?=\\s+(?:PAT|${CLAIM_NUMBER.source}))`,
      "i",
    ),
  );
  return match?.[1] ? normalizeEobCode(match[1]) : undefined;
}

function collectBillEobCodes(
  serviceLines: RemittanceServiceLine[],
  patAndTotal: string,
): string[] {
  const codes = new Set<string>();
  for (const line of serviceLines) {
    if (line.eobCode && isEobCode(line.eobCode)) codes.add(normalizeEobCode(line.eobCode));
  }
  const afterTotal = extractEobAfterBillTotal(patAndTotal);
  if (afterTotal && isEobCode(afterTotal)) codes.add(afterTotal);
  return [...codes];
}

function sanitizeBillEobCodes(
  bill: RemittanceBill,
  catalog: Record<string, string>,
): RemittanceBill {
  const eobCodes = bill.eobCodes.filter((code) => Boolean(catalog[code]));
  const serviceLines = bill.serviceLines.map((line) => ({
    ...line,
    eobCode: line.eobCode && catalog[line.eobCode] ? line.eobCode : undefined,
  }));
  return { ...bill, eobCodes, serviceLines };
}

function parseBillChunk(
  bodyBeforePat: string,
  patAndTotal: string,
  context: {
    section: RemittanceBillSection;
    serviceProviderId: string;
    serviceProviderNpi: string;
    serviceProviderName: string;
  },
): RemittanceBill | null {
  const chunk = bodyBeforePat + patAndTotal;
  const icnMatch = chunk.match(
    /PAT ACCT\/RX NUM-\s*([A-Z0-9]+)\s+ICN-\s*(\d+)/i,
  );
  if (!icnMatch) return null;

  const claimNumber = icnMatch[1]!.toUpperCase();
  const icn = icnMatch[2]!;
  const beforeIcn = chunk.slice(0, icnMatch.index ?? chunk.length);

  const claimStart = beforeIcn.search(CLAIM_NUMBER);
  if (claimStart < 0) return null;

  const billBody = beforeIcn.slice(claimStart);
  const claimLineMatch = billBody.match(
    new RegExp(
      `^(${CLAIM_NUMBER.source})\\s+(.+?)\\s+(\\d{6})\\s+(\\d{6})\\s+([\\d.]+)\\s+(\\w+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)${EOB_CODE_SUFFIX}?`,
    ),
  );
  if (!claimLineMatch) return null;

  const patientName = claimLineMatch[2]!.trim();
  const serviceLines: RemittanceServiceLine[] = [
    parseServiceLineFromClaimRow(claimLineMatch),
  ];

  const afterFirstLine = billBody.slice(claimLineMatch[0]!.length);
  SERVICE_LINE.lastIndex = 0;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = SERVICE_LINE.exec(afterFirstLine)) !== null) {
    if (lineMatch.index > 0 && afterFirstLine[lineMatch.index - 1] === "-") continue;
    serviceLines.push(parseServiceLineMatch(lineMatch));
  }

  const totals = parseBillTotal(patAndTotal);
  if (!totals) return null;

  const eobCodes = collectBillEobCodes(serviceLines, patAndTotal);

  return {
    section: context.section,
    claimNumber,
    patientName,
    icn,
    serviceProviderId: context.serviceProviderId,
    serviceProviderNpi: context.serviceProviderNpi,
    serviceProviderName: context.serviceProviderName,
    serviceLines,
    billTotalBilled: totals.billed,
    billTotalAllowed: totals.allowed,
    billTotalNonCovered: totals.nonCovered,
    billTotalPayable: totals.payable,
    eobCodes,
  };
}

type ProviderMarker = {
  index: number;
  id: string;
  npi: string;
  name: string;
  kind: "name" | "totals";
};

type ProviderSection = {
  start: number;
  end: number;
  provider: Omit<ProviderMarker, "index" | "kind">;
};

function collectProviderMarkers(text: string): ProviderMarker[] {
  const markers: ProviderMarker[] = [];
  const namesById = new Map<string, string>();

  const namePattern =
    /SERVICE\s+PROVIDER\s+NAME\s+(.+?)\s+SERVICE\s+PROVIDER\s+NUMBER\s+(\d+)\s+NPI\s+(\d+)/gi;
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = namePattern.exec(text)) !== null) {
    const id = normalizeLniProviderId(nameMatch[2]!);
    const name = nameMatch[1]!.trim();
    namesById.set(id, name);
    markers.push({
      index: nameMatch.index,
      id,
      npi: nameMatch[3]!,
      name,
      kind: "name",
    });
  }

  const numberOnlyPattern = /SERVICE\s+PROVIDER\s+NUMBER\s+(\d+)\s+NPI\s+(\d+)/gi;
  let numberMatch: RegExpExecArray | null;
  while ((numberMatch = numberOnlyPattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, numberMatch.index - 40), numberMatch.index);
    if (/SERVICE\s+PROVIDER\s+NAME\s*$/i.test(before)) continue;
    const id = normalizeLniProviderId(numberMatch[1]!);
    markers.push({
      index: numberMatch.index,
      id,
      npi: numberMatch[2]!,
      name: namesById.get(id) ?? "",
      kind: "name",
    });
  }

  const totalsPattern = /TOTALS\s+FOR\s+SERVICE\s+PROVIDER\s+(\d+)\s+NPI\s+(\d+)/gi;
  let totalsMatch: RegExpExecArray | null;
  while ((totalsMatch = totalsPattern.exec(text)) !== null) {
    const id = normalizeLniProviderId(totalsMatch[1]!);
    markers.push({
      index: totalsMatch.index,
      id,
      npi: totalsMatch[2]!,
      name: namesById.get(id) ?? "",
      kind: "totals",
    });
  }

  return markers.sort((a, b) => a.index - b.index);
}

function buildProviderSections(text: string, markers: ProviderMarker[]): ProviderSection[] {
  if (!markers.length) return [];

  const sections: ProviderSection[] = [];
  let sectionStart = 0;
  let current: Omit<ProviderMarker, "index" | "kind"> | null = null;

  for (const marker of markers) {
    if (marker.kind === "name") {
      if (current) {
        sections.push({ start: sectionStart, end: marker.index, provider: current });
      }
      current = { id: marker.id, npi: marker.npi, name: marker.name };
      sectionStart = marker.index;
      continue;
    }

    const totalsProvider = {
      id: marker.id,
      npi: marker.npi,
      name: marker.name,
    };
    if (!current) current = totalsProvider;
    sections.push({
      start: sectionStart,
      end: marker.index + 80,
      provider: totalsProvider,
    });
    current = null;
    sectionStart = marker.index + 80;
  }

  if (current) {
    sections.push({ start: sectionStart, end: text.length, provider: current });
  }

  return sections;
}

function findProviderAt(position: number, sections: ProviderSection[]): ProviderSection["provider"] | null {
  for (const section of sections) {
    if (position >= section.start && position < section.end) {
      return section.provider;
    }
  }

  for (const section of sections) {
    if (section.end > position) return section.provider;
  }

  return sections.at(-1)?.provider ?? null;
}

type BillContext = {
  section: RemittanceBillSection;
  serviceProviderId: string;
  serviceProviderNpi: string;
  serviceProviderName: string;
};

function findContextAt(
  providerPosition: number,
  billSectionPosition: number,
  providerSections: ProviderSection[],
  sections: Array<{ index: number; section: RemittanceBillSection }>,
  lastProvider: BillContext | null,
): BillContext {
  let section: RemittanceBillSection = "PAID";

  for (const marker of sections) {
    if (marker.index <= billSectionPosition) section = marker.section;
    else break;
  }

  const provider = findProviderAt(providerPosition, providerSections);
  if (provider) {
    return {
      section,
      serviceProviderId: provider.id,
      serviceProviderNpi: provider.npi,
      serviceProviderName: provider.name,
    };
  }

  if (lastProvider) {
    return { ...lastProvider, section };
  }

  return {
    section,
    serviceProviderId: "",
    serviceProviderNpi: "",
    serviceProviderName: "",
  };
}

function parseDetailBills(
  detailText: string,
  fullText: string,
  detailOffset: number,
): RemittanceBill[] {
  const normalized = normalizeWhitespace(detailText);
  const fullNormalized = normalizeWhitespace(fullText);
  const bills: RemittanceBill[] = [];

  const providerMarkers = collectProviderMarkers(fullNormalized);
  const providerSections = buildProviderSections(fullNormalized, providerMarkers);

  const sections: Array<{ index: number; section: RemittanceBillSection }> = [];
  const sectionPattern =
    /(PAID BILLS - PRACTITIONER BILL|DENIED BILLS - PRACTITIONER BILL|BILLS-IN-PROCESS - PRACTITIONER BILL)/gi;
  let sectionMatch: RegExpExecArray | null;
  while ((sectionMatch = sectionPattern.exec(normalized)) !== null) {
    const label = sectionMatch[1]!.toUpperCase();
    const section: RemittanceBillSection = label.startsWith("PAID")
      ? "PAID"
      : label.startsWith("DENIED")
        ? "DENIED"
        : "IN_PROCESS";
    sections.push({ index: sectionMatch.index, section });
  }

  const billMarkerPattern = /PAT ACCT\/RX NUM-/gi;
  const billStarts: number[] = [];
  let billStartMatch: RegExpExecArray | null;
  while ((billStartMatch = billMarkerPattern.exec(normalized)) !== null) {
    billStarts.push(billStartMatch.index);
  }

  const detailStart = normalized.search(/REMITTANCE ADVICE DETAIL/i);

  let lastProvider: BillContext | null = null;
  for (let i = 0; i < billStarts.length; i++) {
    const patStart = billStarts[i]!;
    const prevPatEnd =
      i === 0
        ? detailStart >= 0
          ? detailStart
          : 0
        : normalized.indexOf("***BILL TOTAL", billStarts[i - 1]!) + "***BILL TOTAL".length;

    const totalStart = normalized.indexOf("***BILL TOTAL", patStart);
    const totalEnd =
      totalStart >= 0
        ? normalized.indexOf(". . .", totalStart) + 40
        : patStart + 200;

    const bodyBeforePat = normalized.slice(prevPatEnd, patStart);
    const patAndTotal = normalized.slice(patStart, totalEnd);
    const context = findContextAt(
      patStart + detailOffset,
      patStart,
      providerSections,
      sections,
      lastProvider,
    );
    if (context.serviceProviderId) {
      lastProvider = {
        serviceProviderId: context.serviceProviderId,
        serviceProviderNpi: context.serviceProviderNpi,
        serviceProviderName: context.serviceProviderName,
        section: context.section,
      };
    }
    const bill = parseBillChunk(bodyBeforePat, patAndTotal, context);
    if (bill) bills.push(bill);
  }

  return bills;
}

export function parseLniRemittanceText(text: string): ParsedRemittanceAdvice {
  const normalized = normalizeWhitespace(text);

  const remittanceNumber =
    normalized.match(/REMITTANCE ADVICE:\s*(\d+)/i)?.[1] ??
    (() => {
      throw new Error("Could not find remittance advice number.");
    })();

  const warrantRegister =
    normalized.match(/WARRANT REGISTER(?::| NUMBER:)\s*(\d+)/i)?.[1] ??
    (() => {
      throw new Error("Could not find warrant register number.");
    })();

  const invoiceDate =
    normalized.match(/INVOICE DATE:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ??
    (() => {
      throw new Error("Could not find invoice date.");
    })();

  const reportDate = normalized.match(/REPORT DATE:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;

  const payeeNumber =
    normalized.match(/PAYEE NUMBER:\s*(\d+)/i)?.[1] ??
    (() => {
      throw new Error("Could not find payee number.");
    })();

  const payeeName =
    normalized.match(/PAYEE NAME:\s*([^]+?)\s+GRANDVIEW COUNSELING/i)?.[1]?.trim() ??
    "GRANDVIEW COUNSELING LLC";

  const totalPaid = parseMoney(
    normalized.match(/\*\*\*\*\*\* TOTAL AMOUNT \*\*\*\*\*\*\s+([\d,.]+)/i)?.[1] ?? "0",
  );

  const detailStart = normalized.search(/REMITTANCE ADVICE DETAIL/i);
  const detailText = detailStart >= 0 ? normalized.slice(detailStart) : normalized;
  const eobCodeDescriptions = extractEobDescriptions(normalized);
  const bills = parseDetailBills(detailText, normalized, detailStart >= 0 ? detailStart : 0).map(
    (bill) => sanitizeBillEobCodes(bill, eobCodeDescriptions),
  );

  if (!bills.length) {
    throw new Error("No remittance bills found in PDF.");
  }

  return {
    remittanceNumber,
    warrantRegister,
    invoiceDate,
    reportDate,
    payeeNumber,
    payeeName,
    totalPaid,
    bills,
    eobCodeDescriptions,
  };
}

export async function parseLniRemittancePdf(buffer: Buffer): Promise<ParsedRemittanceAdvice> {
  const { extractRemittancePdfText } = await import("@/lib/pdf-text");
  const result = await extractRemittancePdfText(buffer);
  if (!result.text.trim()) {
    throw new Error(result.parseError ?? result.ocrError ?? "Could not extract text from remittance PDF.");
  }
  return parseLniRemittanceText(result.text);
}
