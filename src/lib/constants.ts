export const ORG = {
  name: "GRANDVIEW COUNSELING",
  /** L&I payee / provider account number (7 digits). Used in 837 ISA/GS and claim segments. */
  lniProviderId: "0479998",
  /** National Provider Identifier. Used in 837 billing provider (NM1*85). */
  npi: "1568247872",
  /** Federal EIN / FEIN. Used in 837 REF*EI segment. */
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
  /** Additional WA/state registry numbers (not emitted in 837 today). */
  registry: {
    ubi: "605323747",
    dateOfIncorporation: "2023-08-08",
    providerOneApplicationNumber: "20230902362203",
    naicsCode: "621330",
    workersCompAccountId: "535530-00",
    esdNumber: "000968786003",
    applicationId: "20231213212189",
    grandviewProviderNumber: "0479998",
    ffnwbAccountNumber: "396263",
  },
} as const;

/** L&I provider IDs are 7-digit numbers; EDI segments require the leading zero when present. */
export function lniProviderIdForEdi(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.padStart(7, "0");
}

export const PROCEDURE_CODES = [
  { code: "96156", description: "Hlth Behavioral Assmt/Reassessment (BHI)" },
  { code: "96158", description: "Behavioral Health Intervention - Individual" },
  { code: "96159", description: "Add on" },
  { code: "90832", description: "Psychotherapy - Individual 16 to 37 minutes" },
  { code: "90834", description: "Psychotherapy - Individual 45 minutes" },
  { code: "90837", description: "Psychotherapy - Individual 53 to 60 minutes" },
  { code: "9919M", description: "Case management telephone calls" },
  { code: "9918M", description: "Electronic Provider Communication" },
  { code: "1073M", description: "Telephone or online communication bundled" },
  { code: "98966", description: "Telephone evaluation and management - 5-10 minutes" },
  { code: "98967", description: "Telephone evaluation and management - 11-20 minutes" },
  { code: "98968", description: "Telephone evaluation and management - 21-30 minutes" },
] as const;

export type ProcedureCodeNotice = {
  intros?: string[];
  bullets: string[];
  footer?: string;
  footerLinks?: { label: string; href: string }[];
};

export const PROCEDURE_CODE_NOTICES: Partial<Record<string, ProcedureCodeNotice>> = {
  "9918M": {
    intros: [
      "Code 9918M is a localized medical billing code used in the Washington State workers' compensation system (administered by the Department of Labor & Industries, or L&I).",
      "It specifically covers physician and non-physician secure online communications regarding a worker's claim.",
      "Key Rules and Information:",
    ],
    bullets: [
      "Usage Limit: It is strictly limited to once per claim, per day.",
      "Two-Way Communication: When used as part of \"Best Practice 3\" for COHE (Centers of Occupational Health and Education) advisors communicating with employers, a modifier (such as -8R or modifier 32) is often required along with specific chart documentation.",
      "Non-Covered Services: You cannot bill 9918M for routine administrative communications, authorization requests, or routine scheduling.",
    ],
  },
  "9919M": {
    intros: [
      "Code 9919M is a localized medical billing code used in the Washington State Department of Labor & Industries (L&I) worker's compensation system. It specifically represents case management telephone calls between healthcare providers and involved parties (such as employers, vocational counselors, or the injured worker).",
      "To bill code 9919M successfully, providers must meet specific criteria set by L&I:",
    ],
    bullets: [
      "Two-Way Communication: The interaction must be an active, one-on-one phone conversation. Voicemails are considered administrative and are not covered.",
      "Documentation: You must clearly document the date, the length of the call, the participants and their titles, and the nature of the communication and submit it with this invoice.",
      "Frequency limits: Billing is restricted to one call per day, per claim, per provider.",
      "Evaluation & Management (E/M): If you perform a separately identifiable office visit on the same day, code 9919M can be billed alongside the relevant CPT E/M code (e.g., CPT® code 99215) using modifier -25. The time spent on the phone call cannot be counted toward the E/M level selection.",
    ],
    footer: "For full regulatory parameters and fee limits, review the ",
    footerLinks: [
      {
        label: "L&I Chapter 5: Care Coordination",
        href: "https://www.lni.wa.gov/patient-care/billing-payments/marfsdocs/2025/2025MARFSChapter5.pdf",
      },
      {
        label: "L&I Chapter 9: Evaluation and Management guidelines",
        href: "https://lni.wa.gov/patient-care/billing-payments/marfsdocs/2025/2025MarfsChapter9.pdf",
      },
    ],
  },
  "1073M": {
    intros: [
      "Code 1073M is the specific billing code used for the Activity Prescription Form (APF) under the Washington State Department of Labor & Industries (L&I) workers' compensation system. It is used by attending healthcare providers to communicate an injured worker's physical capacity, work restrictions, and progress.",
      "Healthcare providers use code 1073M specifically when there are changes in an injured worker's medical status, work capabilities, or release-to-work status.",
      "Key Rules for Billing 1073M:",
    ],
    bullets: [
      "Authorization: Only the attending provider (or approved concurrent care provider) assigned to the claim can bill for completing and signing this form.",
      "Frequency limits: It is typically limited to one submission per provider, per worker, per day. Usually, a maximum of 6 can be billed within the first 60 days of the initial visit.",
      "No office visit required: In certain circumstances, providers can bill for this code without conducting an in-person office visit.",
    ],
  },
};

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

const CALENDAR_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar date as YYYY-MM-DD (matches HTML date inputs). */
export function todayCalendarIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a calendar ISO date (YYYY-MM-DD) without UTC timezone shift. */
export function formatCalendarIso(iso: string): string {
  const match = CALENDAR_ISO.exec(iso.trim());
  if (!match) return formatDate(iso);
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Read a calendar ISO date from a Date stored as UTC midnight. */
export function calendarIsoFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string" && CALENDAR_ISO.test(d.trim())) {
    return formatCalendarIso(d);
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Folder name for invoice attachments: mm-dd-yyyy from an ISO date (YYYY-MM-DD). */
export function formatServiceDateFolderName(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) throw new Error("Invalid service date.");
  const [, year, month, day] = match;
  return `${month}-${day}-${year}`;
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

export function resolveClientBirthDate(client: {
  dateOfBirth: Date | null;
  dateOfInjury?: Date | null;
}): Date | null {
  return client.dateOfBirth ?? client.dateOfInjury ?? null;
}

export function client837Ready(client: {
  attendingNpi: string | null;
  diagnoses: string[];
  dateOfBirth: Date | null;
  dateOfInjury?: Date | null;
  gender: string | null;
  addressLine1: string | null;
  city: string | null;
  zip: string | null;
}): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!client.attendingNpi) missing.push("Attending NPI");
  if (!client.diagnoses.length) missing.push("Diagnosis");
  if (!resolveClientBirthDate(client)) missing.push("Date of birth or injury date");
  if (!client.gender) missing.push("Gender");
  if (!client.addressLine1) missing.push("Address");
  if (!client.city) missing.push("City");
  if (!client.zip) missing.push("ZIP");
  return { ready: missing.length === 0, missing };
}
