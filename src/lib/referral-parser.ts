import mammoth from "mammoth";
import { DIAGNOSIS_LABEL_PATTERN, parseClaimNumber } from "@/lib/constants";

export type ParsedReferral = {
  vrcName?: string;
  vrcEmail?: string;
  vrcPhone?: string;
  clientName?: string;
  claimNumber?: string;
  dateOfBirth?: Date;
  clientEmail?: string;
  gender?: "M" | "F" | "U";
  attendingNpi?: string;
  diagnoses: string[];
  clientHistory?: string;
  warnings: string[];
};

const FIELD_MARKERS = [
  "Referral Submission",
  "Referring VRC Name",
  "Referring VRC Email",
  "Referring VRC Phone",
  "Preferred method of contact",
  "Client name",
  "Please enter the LNI claim number",
  "Client's Date of Birth",
  "Client's Email Address",
  "If client is attending PGAP",
  "Languages spoken",
  "Client's Gender Identity",
  "Has the client received BHI",
  "Please give a brief history",
  "NPI",
  "Contact Log",
];

function normalizeReferralText(text: string): string {
  let out = text.replace(/\r\n/g, "\n");
  for (const marker of FIELD_MARKERS) {
    out = out.replace(new RegExp(marker, "gi"), `\n${marker}`);
  }
  out = out.replace(new RegExp(`\\n(${DIAGNOSIS_LABEL_PATTERN.source})`, "gi"), "\n$1");
  return out;
}

function fieldValue(text: string, label: RegExp | string): string | undefined {
  const labelPart =
    typeof label === "string"
      ? escapeRegex(label)
      : label.source.replace(/^\^|\$$/g, "");
  const pattern = new RegExp(`${labelPart}[^:\\n]*:\\s*([^\\n]+)`, "i");
  const match = text.match(pattern);
  return match?.[1]?.trim() || undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseGender(raw?: string): "M" | "F" | "U" | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v.includes("female")) return "F";
  if (v.includes("male") && !v.includes("female")) return "M";
  return "U";
}

function parseDob(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDiagnoses(text: string): string[] {
  const match = text.match(
    new RegExp(`${DIAGNOSIS_LABEL_PATTERN.source}[^:\\n]*:\\s*([^\\n]+)`, "i"),
  );
  if (!match?.[1]) return [];
  return match[1]
    .split(/[,;\/]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]\d/.test(c));
}

function parseNpi(text: string): string | undefined {
  const labeled = fieldValue(text, /^NPI$/i);
  if (labeled) {
    const digits = labeled.replace(/\D/g, "");
    if (digits.length === 10) return digits;
  }
  const beforeDiagnosis = text.split(DIAGNOSIS_LABEL_PATTERN)[0] ?? text;
  const anywhere = beforeDiagnosis.match(/\b(\d{10})\b/);
  return anywhere?.[1];
}

function extractClaimNumber(raw?: string): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/\b([A-Z]{2}\d+)\b/i);
  return match ? parseClaimNumber(match[1]!) : undefined;
}

function splitClientName(full?: string): { firstName: string; lastName: string } | null {
  if (!full) return null;
  const cleaned = full.split(/Please enter the LNI/i)[0]?.trim() ?? full.trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: parts[0] ?? "" };
  const lastName = parts[parts.length - 1] ?? "";
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

export async function parseReferralDocx(buffer: Buffer): Promise<ParsedReferral> {
  const { value: text } = await mammoth.extractRawText({ buffer });
  const normalized = normalizeReferralText(text);
  const warnings: string[] = [];

  const claimRaw = fieldValue(normalized, "Please enter the LNI claim number");
  const claimNumber = extractClaimNumber(claimRaw);
  if (!claimNumber) warnings.push("Could not find L&I claim number");

  const attendingNpi = parseNpi(normalized);
  if (!attendingNpi) warnings.push("Could not find attending NPI");

  const diagnoses = parseDiagnoses(normalized);
  if (!diagnoses.length) warnings.push("Could not find diagnosis codes");

  return {
    vrcName: fieldValue(normalized, "Referring VRC Name"),
    vrcEmail: fieldValue(normalized, "Referring VRC Email")?.match(/[^\s]+@[^\s]+/)?.[0],
    vrcPhone: fieldValue(normalized, "Referring VRC Phone")?.match(/[\d()\-\s.+]+/)?.[0]?.trim(),
    clientName: fieldValue(normalized, "Client name"),
    claimNumber,
    dateOfBirth: parseDob(fieldValue(normalized, "Client's Date of Birth")),
    clientEmail: fieldValue(normalized, "Client's Email Address")?.match(/[^\s]+@[^\s]+/)?.[0],
    gender: parseGender(fieldValue(normalized, "Client's Gender Identity")),
    attendingNpi,
    diagnoses,
    clientHistory: fieldValue(normalized, "Please give a brief history"),
    warnings,
  };
}

export { splitClientName };
