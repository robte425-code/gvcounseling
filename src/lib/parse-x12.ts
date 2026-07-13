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

export function parseX12(content: string): ParsedX12 {
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

  if (!segments.some((segment) => segment.id === "ST" && segment.elements[0] === "835")) {
    throw new Error("X12 file is not an 835 remittance (ST*835 not found).");
  }

  return { elementSeparator, componentSeparator, segmentTerminator, segments };
}

export function splitX12Composite(
  value: string,
  componentSeparator: string,
): string[] {
  return value.split(componentSeparator).map((part) => part.trim());
}

export function parseX12Date(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length === 6) {
    const yy = Number.parseInt(digits.slice(0, 2), 10);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  }
  return null;
}

export function formatX12DateForRa(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

export function parseX12Money(value: string | undefined): number {
  if (!value) return 0;
  const amount = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
