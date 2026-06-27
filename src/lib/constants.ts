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

export const PROCEDURE_CODES = [
  { code: "98966", description: "1-10 minutes phone call" },
  { code: "98967", description: "11-20 minutes phone call" },
  { code: "98968", description: "21+ minutes phone call" },
  { code: "96156", description: "Hlth Behavioral Assmt/Reassessment (BHI)" },
  { code: "96158", description: "Behavioral Health Intervention - Individual" },
  { code: "96159", description: "Add on" },
  { code: "90832", description: "Psychotherapy - Individual 16 to 37 minutes" },
  { code: "90834", description: "Psychotherapy - Individual 45 minutes" },
  { code: "90837", description: "Psychotherapy - Individual 53 to 60 minutes" },
] as const;

export const BHI_PROCEDURE_CODES = PROCEDURE_CODES.map((entry) => entry.code);

export function formatProcedureCodeLabel(code: string): string {
  const entry = PROCEDURE_CODES.find((item) => item.code === code);
  return entry ? `${entry.code} — ${entry.description}` : code;
}

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

/** Reject OCR table fragments like S13, S33, A328 — real ICD-10 codes have a decimal after the category. */
export function isPlausibleIcdCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (!/^[A-TV-Z]\d[\d.A-Z]*$/.test(c)) return false;
  if (c.length < 5) return false;
  return /^[A-TV-Z]\d{2}\./.test(c);
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

/** Prefer Drive folder claim # when it disagrees with referral or supplement sources. */
export function resolveImportClaimNumber(
  folderClaim?: string,
  referralClaim?: string,
  supplementClaim?: string,
): { claimNumber?: string; warnings: string[] } {
  const warnings: string[] = [];
  const folder = folderClaim && isLniClaimNumber(folderClaim) ? parseClaimNumber(folderClaim) : undefined;
  const referral =
    referralClaim && isLniClaimNumber(referralClaim) ? parseClaimNumber(referralClaim) : undefined;
  const supplement =
    supplementClaim && isLniClaimNumber(supplementClaim)
      ? parseClaimNumber(supplementClaim)
      : undefined;

  if (folder) {
    if (referral && referral !== folder) {
      warnings.push(
        `Referral claim number ${referral} differs from folder claim ${folder}; using folder claim number.`,
      );
    } else if (supplement && supplement !== folder && !referral) {
      warnings.push(
        `Supplement claim number ${supplement} differs from folder claim ${folder}; using folder claim number.`,
      );
    }
    return { claimNumber: folder, warnings };
  }

  return { claimNumber: referral ?? supplement, warnings };
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
