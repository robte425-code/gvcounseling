export type X12Segment = {
  id: string;
  elements: string[];
};

export type ParsedX12 = {
  elementSeparator: string;
  componentSeparator: string;
  segmentTerminator: string;
  segments: X12Segment[];
};

function detectSeparators(content: string): {
  elementSeparator: string;
  componentSeparator: string;
  segmentTerminator: string;
} {
  if (!content.startsWith("ISA")) {
    throw new Error("Not an X12 interchange (missing ISA segment).");
  }

  const elementSeparator = content[3] ?? "*";
  const firstIsaEnd = content.indexOf("~");
  const isaSegment =
    firstIsaEnd >= 0 ? content.slice(0, firstIsaEnd) : content.slice(0, 106);
  const isaParts = isaSegment.split(elementSeparator);
  const componentSeparator = isaParts[16]?.[0] ?? ":";
  const segmentTerminator =
    isaParts[16]?.length && isaParts[16]!.length > 1
      ? isaParts[16]![isaParts[16]!.length - 1]!
      : "~";

  return { elementSeparator, componentSeparator, segmentTerminator };
}

export function parseX12(
  content: string,
  options?: { requireTransactionSet?: string },
): ParsedX12 {
  const trimmed = content.replace(/\r\n/g, "\n").trim();
  const { elementSeparator, componentSeparator, segmentTerminator } = detectSeparators(trimmed);

  const segments: X12Segment[] = [];
  const rawSegments = trimmed
    .split(segmentTerminator)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  for (const piece of rawSegments) {
    const parts = piece.split(elementSeparator);
    const id = parts[0]?.trim();
    if (!id) continue;
    segments.push({ id, elements: parts.slice(1) });
  }

  const requireSt = options?.requireTransactionSet ?? "835";
  if (
    requireSt &&
    !segments.some((segment) => segment.id === "ST" && segment.elements[0] === requireSt)
  ) {
    throw new Error(`X12 file is not a ${requireSt} transaction (ST*${requireSt} not found).`);
  }

  return { elementSeparator, componentSeparator, segmentTerminator, segments };
}

export function splitX12Composite(
  value: string,
  componentSeparator: string,
): string[] {
  return value.split(componentSeparator).map((part) => part.trim());
}

/** Rejects impossible month/day rather than letting Date roll them over: an 835
 *  carrying 20241332 became 2025-02-01 and was stored as a real payment date. */
function isoDateOrNull(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function parseX12Date(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) {
    return isoDateOrNull(
      Number.parseInt(digits.slice(0, 4), 10),
      Number.parseInt(digits.slice(4, 6), 10),
      Number.parseInt(digits.slice(6, 8), 10),
    );
  }
  if (digits.length === 6) {
    const yy = Number.parseInt(digits.slice(0, 2), 10);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return isoDateOrNull(
      year,
      Number.parseInt(digits.slice(2, 4), 10),
      Number.parseInt(digits.slice(4, 6), 10),
    );
  }
  return null;
}

export function formatX12DateForRa(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

/**
 * An absent or empty element is a legitimate zero in X12. A present but
 * unreadable one is not: returning 0 there reclassified a paid claim as
 * in-process and left the invoice awaiting payment forever, with no warning.
 */
export function parseX12Money(value: string | undefined): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const unseparated = trimmed.replace(/,/g, "");
  // parseFloat stops at the first character it cannot read, so "1O5.00" — a
  // letter O for a zero, exactly what OCR produces — would quietly become 1.
  if (!/^[+-]?\d+(\.\d+)?$/.test(unseparated)) {
    throw new Error(`Could not read a dollar amount from "${value}" in the 835 file.`);
  }
  const amount = Number.parseFloat(unseparated);
  if (!Number.isFinite(amount)) {
    throw new Error(`Could not read a dollar amount from "${value}" in the 835 file.`);
  }
  return Math.round(amount * 100) / 100;
}
