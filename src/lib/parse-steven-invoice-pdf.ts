const STEVEN_PROCEDURE_CODES = [
  "96156",
  "96158",
  "96159",
  "90832",
  "90834",
  "90837",
  "9918M",
  "9919M",
  "1073M",
] as const;

export const STEVEN_FEES: Record<string, number> = {
  "96156": 85,
  "96158": 42.5,
  "96159": 21.25,
};

const SESSION_85: StevenInvoiceLineItem[] = [
  { procedureCode: "96158", amount: 42.5 },
  { procedureCode: "96159", amount: 21.25 },
  { procedureCode: "96159", amount: 21.25 },
];

const SESSION_6375: StevenInvoiceLineItem[] = [
  { procedureCode: "96158", amount: 42.5 },
  { procedureCode: "96159", amount: 21.25 },
];

const SESSION_4250: StevenInvoiceLineItem[] = [{ procedureCode: "96158", amount: 42.5 }];

const REASSESS_85: StevenInvoiceLineItem[] = [{ procedureCode: "96156", amount: 85 }];

export type StevenInvoiceLineItem = {
  procedureCode: string;
  amount: number;
};

export type ParsedStevenInvoice = {
  invoiceNumber: number;
  claimNumber?: string;
  totalDue: number | null;
  lineItems: StevenInvoiceLineItem[];
};

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|;]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseMoney(value: string): number | null {
  const n = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseClaimNumber(text: string): string | undefined {
  const match = text.match(/Claim\s*(?:Number|#)\s*:?\s*([A-Z]{1,2}\d+)/i);
  if (!match) return undefined;
  return match[1]!.toUpperCase();
}

function parseInvoiceNumber(text: string): number | null {
  const match = text.match(/INVOICE\s*#\s*(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseTotalDue(text: string): number | null {
  const match = text.match(/TOTAL\s+DUE\s+(\d+(?:\.\d{2})?)/i);
  return match ? parseMoney(match[1]!) : null;
}

/** Extract procedure codes and dollar amounts in document order, then pair by index. */
function parseLineItems(text: string): StevenInvoiceLineItem[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const codeRe = new RegExp(`\\b(${STEVEN_PROCEDURE_CODES.join("|")})\\b`, "gi");

  const codes: string[] = [];
  const amounts: number[] = [];

  let inAmountSection = false;
  for (const line of lines) {
    if (/^amount$/i.test(line) || /^billed$/i.test(line) || /amount\s+billed/i.test(line)) {
      inAmountSection = true;
    }

    const codeMatches = [...line.matchAll(codeRe)];
    for (const match of codeMatches) {
      codes.push(match[1]!.toUpperCase());
    }

    const moneyOnly = line.match(/^(\d+\.\d{2})$/);
    if (moneyOnly) {
      const amount = parseMoney(moneyOnly[1]!);
      if (amount != null) amounts.push(amount);
      continue;
    }

    if (inAmountSection) {
      const embedded = line.match(/\b(\d+\.\d{2})\b/);
      if (embedded && !/minutes?/i.test(line) && !/invoice/i.test(line)) {
        const amount = parseMoney(embedded[1]!);
        if (amount != null) amounts.push(amount);
      }
    }
  }

  if (codes.length && codes.length === amounts.length) {
    return codes.map((procedureCode, index) => ({
      procedureCode,
      amount: amounts[index]!,
    }));
  }

  // Fallback: pair each code with the next amount before the following code.
  const items: StevenInvoiceLineItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const codeMatch = lines[i]!.match(
      new RegExp(`^(${STEVEN_PROCEDURE_CODES.join("|")})\\b`, "i"),
    );
    if (!codeMatch) continue;

    const procedureCode = codeMatch[1]!.toUpperCase();
    let amount: number | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]!.match(new RegExp(`^(${STEVEN_PROCEDURE_CODES.join("|")})\\b`, "i"))) break;
      const moneyOnly = lines[j]!.match(/^(\d+\.\d{2})$/);
      if (moneyOnly) {
        amount = parseMoney(moneyOnly[1]!);
        break;
      }
    }
    if (amount != null) items.push({ procedureCode, amount });
  }

  return items;
}

function sumLineItems(items: StevenInvoiceLineItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
}

/** Ordered CPT codes as they appear in the invoice body (ignores mis-paired amounts). */
export function extractProcedureCodes(text: string): string[] {
  const normalized = normalizeText(text);
  const codeRe = new RegExp(`\\b(${STEVEN_PROCEDURE_CODES.join("|")})\\b`, "gi");
  const codes = [...normalized.matchAll(codeRe)].map((match) => match[1]!.toUpperCase());

  // OCR often truncates 96158 → "9615" on the first intervention row.
  if (!codes.includes("96158") && /\b9615\b/i.test(normalized) && /behavioral\s+health/i.test(normalized)) {
    const first96159 = codes.indexOf("96159");
    if (first96159 === -1) {
      codes.push("96158");
    } else {
      codes.splice(first96159, 0, "96158");
    }
  }

  return codes;
}

function isReassessmentInvoice(text: string, codes: string[]): boolean {
  if (/for \d+ out of \d+ sessions|behavioral health intervention/i.test(text)) {
    return false;
  }
  return (
    /reassessment|initial\s+assessment|\bassmt\b/i.test(text) ||
    (codes.includes("96156") &&
      !codes.includes("96158") &&
      codes.filter((c) => c === "96159").length === 0 &&
      /reassessment|assmt/i.test(text))
  );
}

/**
 * Reconstruct line items from OCR code hints + invoice total.
 * Handles common OCR errors: 96158 read as 96156, $85 lumped on base code, missing 96158 row.
 */
export function normalizeStevenLineItems(
  text: string,
  rawItems: StevenInvoiceLineItem[],
  totalDue: number,
): StevenInvoiceLineItem[] | null {
  const total = Math.round(totalDue * 100) / 100;
  const codes = extractProcedureCodes(text);
  const count96159 = codes.filter((c) => c === "96159").length;
  const has96158 = codes.includes("96158");
  const has96156 = codes.includes("96156");
  const isReassessmentDoc = isReassessmentInvoice(text, codes);

  if (total === 85) {
    // Phantom 96156 from OCR misread of 96158 — drop when add-on 96159 rows exist.
    if (has96156 && count96159 >= 1) {
      return SESSION_85.map((item) => ({ ...item }));
    }
    if (count96159 >= 2 || (has96158 && count96159 >= 1)) {
      return SESSION_85.map((item) => ({ ...item }));
    }
    if (count96159 >= 1 && !has96158 && !has96156) {
      return SESSION_85.map((item) => ({ ...item }));
    }
    if (has96156 && count96159 === 0 && isReassessmentDoc) {
      return REASSESS_85.map((item) => ({ ...item }));
    }
    if (/intervention|96158|\b9615\b|for \d+ out of \d+ sessions/i.test(text)) {
      return SESSION_85.map((item) => ({ ...item }));
    }
  }

  if (total === 63.75) {
    if (count96159 >= 1 || has96158 || has96156) {
      return SESSION_6375.map((item) => ({ ...item }));
    }
  }

  if (total === 42.5) {
    return SESSION_4250.map((item) => ({ ...item }));
  }

  if (Math.abs(sumLineItems(rawItems) - total) <= 0.02) {
    return rawItems.map((item) => {
      const fee = STEVEN_FEES[item.procedureCode];
      if (fee != null && Math.abs(item.amount - fee) > 0.02) {
        return { procedureCode: item.procedureCode, amount: fee };
      }
      return { ...item };
    });
  }

  return null;
}

export function parseStevenInvoiceText(rawText: string): ParsedStevenInvoice | null {
  const text = normalizeText(rawText);
  const invoiceNumber = parseInvoiceNumber(text);
  if (!invoiceNumber) return null;

  const rawLineItems = parseLineItems(text);
  if (!rawLineItems.length) return null;

  const totalDue = parseTotalDue(text) ?? sumLineItems(rawLineItems);
  const normalized = normalizeStevenLineItems(text, rawLineItems, totalDue);
  const lineItems = normalized ?? rawLineItems;

  return {
    invoiceNumber,
    claimNumber: parseClaimNumber(text),
    totalDue,
    lineItems,
  };
}

export function isStevenInvoiceFilename(name: string): boolean {
  return /invoice/i.test(name) && /\.pdf$/i.test(name);
}

/** Steven session folders: 6-28-25, 03-14-2025, etc. */
export function isStevenSessionFolderName(name: string): boolean {
  return /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(name.trim());
}
