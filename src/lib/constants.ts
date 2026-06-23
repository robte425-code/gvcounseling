export const ORG = {
  name: "GRANDVIEW COUNSELING",
  lniProviderId: "479998",
  npi: "1568247872",
  taxId: "933096824",
  addressLine1: "5608 17TH AVENUE NW, STE. 596",
  city: "SEATTLE",
  state: "WA",
  zip: "98107",
  contactName: "ROBERT EVANS",
  contactPhone: "2065690801",
  contactEmail: "ghim@gvcounseling.com",
  receiverId: "916001069",
  receiverName: "WASHINGTON STATE DEPT OF LABOR & INDUSTRIES",
  receiverCity: "OLYMPIA",
  receiverState: "WA",
  receiverZip: "98504",
} as const;

export const BHI_PROCEDURE_CODES = [
  "96156",
  "96158",
  "96159",
  "98966",
  "98967",
  "98968",
  "90837",
] as const;

export const REFERRAL_FILENAME_PATTERN =
  /referr[a-z]*\s*submis/i;

export const DIAGNOSIS_LABEL_PATTERN =
  /diagnos(?:is|es|eis|sis|oses)?/i;

export function formatCurrency(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function parseClaimNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** L&I claim numbers are typically 1–2 letters followed by digits (e.g. Y965895, BL12687). */
export function isLniClaimNumber(raw: string): boolean {
  return /^[A-Z]{1,2}\d+$/.test(parseClaimNumber(raw));
}

export function extractClaimNumber(raw?: string): string | undefined {
  if (!raw) return undefined;

  const tokenMatch = raw.match(/\b([A-Z]{1,2}\d+)\b/i);
  if (tokenMatch?.[1] && isLniClaimNumber(tokenMatch[1])) {
    return parseClaimNumber(tokenMatch[1]);
  }

  const compact = parseClaimNumber(raw.replace(/[^A-Za-z0-9]/g, ""));
  if (isLniClaimNumber(compact)) return compact;

  return undefined;
}

export function isReferralSubmissionFilename(filename: string): boolean {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return REFERRAL_FILENAME_PATTERN.test(base);
}

export function client837Ready(client: {
  attendingNpi: string | null;
  diagnoses: string[];
  dateOfBirth: Date | null;
  gender: string | null;
  addressLine1: string | null;
  city: string | null;
  zip: string | null;
}): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!client.attendingNpi) missing.push("Attending NPI");
  if (!client.diagnoses.length) missing.push("Diagnosis");
  if (!client.dateOfBirth) missing.push("Date of birth");
  if (!client.gender) missing.push("Gender");
  if (!client.addressLine1) missing.push("Address");
  if (!client.city) missing.push("City");
  if (!client.zip) missing.push("ZIP");
  return { ready: missing.length === 0, missing };
}
