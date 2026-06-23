import { DIAGNOSIS_LABEL_PATTERN, extractClaimNumber } from "@/lib/constants";

export type ParsedClaimStatus = {
  claimNumber?: string;
  clientName?: string;
  dateOfInjury?: Date;
  diagnoses: string[];
  warnings: string[];
};

function parseInjuryDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normalizeClaimStatusText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}

function fieldAfter(text: string, label: RegExp): string | undefined {
  const match = text.match(new RegExp(`${label.source}\\s+([^\\n]+?)(?=\\s+(?:Employer|Attending|Claim Manager|Status|Diagnosis|$))`, "i"));
  return match?.[1]?.trim() || undefined;
}

function parseDiagnosisCodes(text: string): string[] {
  const section = text.split(/Diagnosis and coverage decisions/i)[1] ?? text;
  const codes = new Set<string>();

  for (const match of section.matchAll(/\b([A-TV-Z]\d{2}(?:\.\d+)?[A-Z0-9]?)\b/g)) {
    const code = match[1]!.toUpperCase();
    if (/^[A-TV-Z]\d/.test(code) && code.length >= 3) codes.add(code);
  }

  if (codes.size) return [...codes];

  const labeled = text.match(
    new RegExp(`${DIAGNOSIS_LABEL_PATTERN.source}[^:\\n]*:\\s*([^\\n]+)`, "i"),
  );
  if (labeled?.[1]) {
    for (const part of labeled[1].split(/[,;\/]+/)) {
      const code = part.trim().toUpperCase();
      if (/^[A-TV-Z]\d/.test(code)) codes.add(code);
    }
  }

  return [...codes];
}

export function parseLniClaimStatusText(rawText: string): ParsedClaimStatus {
  const text = normalizeClaimStatusText(rawText);
  const warnings: string[] = [];

  const claimRaw =
    text.match(/Claim number\s+([A-Z0-9]+)/i)?.[1] ??
    text.match(/\bClaim\s+#?\s*([A-Z]{1,2}\d+)\b/i)?.[1];
  const claimNumber = extractClaimNumber(claimRaw);
  if (!claimNumber) warnings.push("Could not find claim number in claim status PDF");

  const injuryRaw = text.match(/Injury date\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  const dateOfInjury = parseInjuryDate(injuryRaw);

  const clientName = fieldAfter(text, /Worker name/i);
  const diagnoses = parseDiagnosisCodes(text);
  if (!diagnoses.length) warnings.push("Could not find diagnosis codes in claim status PDF");

  return { claimNumber, clientName, dateOfInjury, diagnoses, warnings };
}
