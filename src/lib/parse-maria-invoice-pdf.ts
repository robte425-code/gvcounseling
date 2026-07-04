const MARIA_PROCEDURE_CODES = [
  "96156",
  "96158",
  "96159",
  "90832",
  "90834",
  "90837",
  "98966",
  "98967",
  "98968",
  "9918M",
  "9919M",
  "1073M",
] as const;

/** Maria fee schedules (matches import-maria-invoices.ts). */
export const MARIA_FEE_SCHEDULES: { effectiveFrom: string; fees: Record<string, number> }[] = [
  {
    effectiveFrom: "2024-03-01",
    fees: {
      "96156": 65,
      "96158": 32.5,
      "96159": 16.25,
      "90837": 90,
      "90834": 67.5,
      "90832": 35,
      "9919M": 30.29,
      "9918M": 24.23,
      "1073M": 27.56,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
  {
    effectiveFrom: "2024-05-10",
    fees: {
      "96156": 70,
      "96158": 35,
      "96159": 17.5,
      "90837": 90,
      "90834": 67.5,
      "90832": 35,
      "9919M": 30.29,
      "9918M": 24.23,
      "1073M": 27.56,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
  {
    effectiveFrom: "2025-03-01",
    fees: {
      "96156": 75,
      "96158": 37.5,
      "96159": 18.75,
      "90837": 95,
      "90834": 71.25,
      "90832": 47.5,
      "9919M": 33.21,
      "9918M": 26.57,
      "1073M": 30.21,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
  {
    effectiveFrom: "2026-03-01",
    fees: {
      "96156": 77,
      "96158": 38.5,
      "96159": 19.25,
      "90837": 97,
      "90834": 72.75,
      "90832": 48.5,
      "9919M": 34.45,
      "9918M": 27.56,
      "1073M": 31.34,
      "98966": 12,
      "98967": 22.2,
      "98968": 30.29,
    },
  },
];

const PARTIAL_BHI_TOTALS = new Set([48.75, 52.5, 56.25, 57.75]);

/** Spaced CPT pattern — PDF text often inserts spaces inside codes (9615 8, 9 8968). */
const MARIA_CODE_RE =
  /\b(?:9\s*6\s*1\s*5\s*[6-9]|9\s*0\s*8\s*3\s*[247]|9\s*8\s*9\s*6\s*[6-8]|991\s*[89]\s*M|1073\s*M)\b/gi;

export type MariaInvoiceLineItem = {
  procedureCode: string;
  amount: number;
};

export type ParsedMariaInvoice = {
  invoiceNumber: number;
  claimNumber?: string;
  totalDue: number | null;
  lineItems: MariaInvoiceLineItem[];
};

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseSpacedMoney(raw: string): number | null {
  const compact = raw.replace(/[^\d.]/g, "");
  if (compact) {
    const fromCompact = Number(compact);
    if (Number.isFinite(fromCompact) && fromCompact > 0 && fromCompact <= 200) {
      return Math.round(fromCompact * 100) / 100;
    }
  }

  const digitsOnly = raw.replace(/[^\d]/g, "");
  if (digitsOnly.length >= 3 && digitsOnly.length <= 5) {
    const n = Number(`${digitsOnly.slice(0, -2)}.${digitsOnly.slice(-2)}`);
    if (Number.isFinite(n) && n > 0 && n <= 200) {
      return Math.round(n * 100) / 100;
    }
  }

  return null;
}

function isReasonableLineAmount(amount: number): boolean {
  return amount > 0 && amount <= 200;
}

function normalizeProcedureCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Invoice # may read "0 520", "1 0 0 8", "0 3 98" — concatenate digit groups. */
export function parseMariaInvoiceNumber(text: string): number | null {
  const match = text.match(/Invoice\s*#\s*([\d\s]+?)(?:\s+Date|\s+DATE|\s+BILL|\s+CLIENT|$)/i);
  if (!match) return null;
  const digits = match[1]!.replace(/\s+/g, "");
  const n = Number(digits);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseMariaClaimNumber(text: string): string | undefined {
  const match = text.match(/Claim\s*#?\(?s?\)?\s*:?\s*([A-Z]\s*[A-Z]?\s*\d+)/i);
  if (!match) return undefined;
  return match[1]!.replace(/\s+/g, "").toUpperCase();
}

function parseMariaTotalDue(text: string): number | null {
  const match = text.match(/BA\s*LANCE\s+DUE\s+\$?\s*([\d\s.]+)/i);
  if (match) return parseSpacedMoney(match[1]!);
  const totalMatch = text.match(/TOTAL\s+DUE\s+\$?\s*([\d\s.]+)/i);
  return totalMatch ? parseSpacedMoney(totalMatch[1]!) : null;
}

function extractLineItemSection(text: string): string | null {
  const start = text.search(/Amount\s+Billed/i);
  if (start === -1) return null;
  const slice = text.slice(start);
  const end = slice.search(/BA\s*LANCE\s+DUE|TOTAL\s+DUE|Make all checks payable/i);
  return end === -1 ? slice : slice.slice(0, end);
}

function parseAmountInSlice(slice: string): number | null {
  const dollar = slice.match(/\$\s*([\d\s.]+)/);
  if (dollar) {
    const amount = parseSpacedMoney(dollar[1]!);
    if (amount != null && isReasonableLineAmount(amount)) return amount;
  }

  const barePatterns = [
    /(?:Reassessment|Intervention|Psychotherapy|Telephone|Add\s*on|mins?)[^$\d]*(\d[\d\s.]+)\s*$/i,
    /\b(\d{1,3}(?:\.\d{2})?)\s*$/,
  ];
  for (const pattern of barePatterns) {
    const match = slice.match(pattern);
    if (match) {
      const amount = parseSpacedMoney(match[1]!);
      if (amount != null && isReasonableLineAmount(amount)) return amount;
    }
  }
  return null;
}

function extractProcedureCodesOrdered(segment: string): string[] {
  const codes: string[] = [];
  const re = new RegExp(MARIA_CODE_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(segment)) !== null) {
    codes.push(normalizeProcedureCode(match[0]));
  }
  return codes;
}

function parseLineItems(text: string): MariaInvoiceLineItem[] {
  const section = extractLineItemSection(text);
  if (!section) return [];

  const re = new RegExp(MARIA_CODE_RE.source, "gi");
  const matches = [...section.matchAll(re)];
  const items: MariaInvoiceLineItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const procedureCode = normalizeProcedureCode(match[0]);
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : section.length;
    const amount = parseAmountInSlice(section.slice(start, end));
    if (amount != null) items.push({ procedureCode, amount });
  }

  return items;
}

function sumLineItems(items: MariaInvoiceLineItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
}

export function extractMariaProcedureCodes(text: string): string[] {
  const section = extractLineItemSection(normalizeText(text));
  return section ? extractProcedureCodesOrdered(section) : [];
}

function buildItemsFromCodes(
  codes: string[],
  fees: Record<string, number>,
  total: number,
): MariaInvoiceLineItem[] | null {
  const items: MariaInvoiceLineItem[] = [];
  for (const code of codes) {
    const fee = fees[code];
    if (fee == null) return null;
    items.push({ procedureCode: code, amount: fee });
  }
  if (Math.abs(sumLineItems(items) - total) <= 0.02) return items;
  return null;
}

function matchFeeScheduleToCodesAndTotal(
  codes: string[],
  total: number,
): MariaInvoiceLineItem[] | null {
  for (let i = MARIA_FEE_SCHEDULES.length - 1; i >= 0; i--) {
    const matched = buildItemsFromCodes(codes, MARIA_FEE_SCHEDULES[i]!.fees, total);
    if (matched) return matched;
  }
  return null;
}

function isReassessmentInvoice(text: string, codes: string[]): boolean {
  if (/behavioral health intervention|for \d+ of \d+/i.test(text)) {
    if (codes.includes("96158") || codes.filter((c) => c === "96159").length > 0) return false;
  }
  return (
    /reassessment|initial assessment|\bassessment\b/i.test(text) &&
    codes.includes("96156") &&
    !codes.includes("96158") &&
    codes.filter((c) => c === "96159").length === 0
  );
}

function normalizeMariaLineItems(
  text: string,
  rawItems: MariaInvoiceLineItem[],
  totalDue: number,
): MariaInvoiceLineItem[] | null {
  const total = Math.round(totalDue * 100) / 100;
  const codes = extractMariaProcedureCodes(text);
  const count96159 = codes.filter((c) => c === "96159").length;
  const has96158 = codes.includes("96158");
  const has96156 = codes.includes("96156");

  if (PARTIAL_BHI_TOTALS.has(total) && has96156 && !has96158 && count96159 === 0) {
    return [{ procedureCode: "96156", amount: total }];
  }

  const fromSchedule = matchFeeScheduleToCodesAndTotal(codes, total);
  if (fromSchedule) return fromSchedule;

  if (has96158 && !has96156) {
    for (let i = MARIA_FEE_SCHEDULES.length - 1; i >= 0; i--) {
      const fees = MARIA_FEE_SCHEDULES[i]!.fees;
      const fee58 = fees["96158"];
      const fee59 = fees["96159"];
      if (fee58 == null || fee59 == null) continue;
      const remainder = Math.round((total - fee58) * 100) / 100;
      if (remainder < 0) continue;
      const count59 = Math.round(remainder / fee59);
      if (count59 >= 1 && Math.abs(fee58 + count59 * fee59 - total) <= 0.02) {
        const items: MariaInvoiceLineItem[] = [{ procedureCode: "96158", amount: fee58 }];
        for (let j = 0; j < count59; j++) items.push({ procedureCode: "96159", amount: fee59 });
        return items;
      }
    }
  }

  // PDF text sometimes reads 96158 as 96156 when add-on 96159 rows exist.
  if (has96156 && count96159 >= 1 && /intervention|for \d+ of \d+/i.test(text)) {
    for (let i = MARIA_FEE_SCHEDULES.length - 1; i >= 0; i--) {
      const fees = MARIA_FEE_SCHEDULES[i]!.fees;
      const bhiItems: MariaInvoiceLineItem[] = [{ procedureCode: "96158", amount: fees["96158"]! }];
      for (let j = 0; j < count96159; j++) {
        bhiItems.push({ procedureCode: "96159", amount: fees["96159"]! });
      }
      if (Math.abs(sumLineItems(bhiItems) - total) <= 0.02) return bhiItems;
    }
  }

  if (has96156 && !has96158 && count96159 === 0 && isReassessmentInvoice(text, codes)) {
    for (let i = MARIA_FEE_SCHEDULES.length - 1; i >= 0; i--) {
      const fee = MARIA_FEE_SCHEDULES[i]!.fees["96156"];
      if (fee != null && Math.abs(fee - total) <= 0.02) {
        return [{ procedureCode: "96156", amount: fee }];
      }
    }
  }

  if (Math.abs(sumLineItems(rawItems) - total) <= 0.02) return rawItems.map((item) => ({ ...item }));

  return null;
}

export function isMariaInvoiceDocument(text: string): boolean {
  return /Maria\s+B\.?\s*Castro/i.test(text) || /mbcastrocounseling/i.test(text);
}

export function parseMariaInvoiceText(rawText: string): ParsedMariaInvoice | null {
  const text = normalizeText(rawText);
  if (!isMariaInvoiceDocument(text)) return null;

  const invoiceNumber = parseMariaInvoiceNumber(text);
  if (!invoiceNumber) return null;

  const lineItemsRaw = parseLineItems(text);
  const codes = extractMariaProcedureCodes(text);
  const totalDue = parseMariaTotalDue(text);
  const total =
    totalDue ??
    (lineItemsRaw.length ? sumLineItems(lineItemsRaw) : null);
  if (total == null || (!lineItemsRaw.length && !codes.length)) return null;

  const lineItems = normalizeMariaLineItems(text, lineItemsRaw, total) ?? lineItemsRaw;
  if (!lineItems.length) return null;

  return {
    invoiceNumber,
    claimNumber: parseMariaClaimNumber(text),
    totalDue: total,
    lineItems,
  };
}

export function isMariaInvoiceFilename(name: string): boolean {
  return /invoice/i.test(name) && /\.pdf$/i.test(name);
}

/** Maria session folders: 6-28-25, 03-14-2025, 06-25-2026, etc. */
export function isMariaSessionFolderName(name: string): boolean {
  return /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(name.trim());
}
