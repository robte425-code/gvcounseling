import type { ClientDocumentSupplement } from "@/lib/client-document-import";
import { isLniClaimNumber, isPlausibleIcdCode } from "@/lib/constants";
import {
  isPlausibleEmployerName,
  isPlausiblePersonName,
  isPlausibleWorkerAddress,
} from "@/lib/parse-lni-cac-fields";
import type { ParsedReferral } from "@/lib/referral-parser";

export type ClientDocumentPart = {
  filename: string;
  supplement: ClientDocumentSupplement;
};

export type ImportQualityContext = {
  folderClaimNumber?: string;
  folderDisplayName?: string;
  documentParts?: ClientDocumentPart[];
};

const DOCTOR_CREDENTIAL = /\b(PAC|ARNP|MD|DO|DC|APRN|NP)\b/i;
const PHONE_PATTERN = /^\d{3}-\d{3}-\d{4}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_PATTERN = /^\d{5}$/;

export function isPlausibleDoctorName(name?: string | null): boolean {
  const n = name?.trim();
  if (!n || n.length < 5 || n.length > 60) return false;
  if (/\b(ATTENDING DOCTOR|LEGAL REPRESENTATIVE|CLAIM MANAGER)\b/i.test(n)) return false;
  if (DOCTOR_CREDENTIAL.test(n)) return true;
  return isPlausiblePersonName(n) && n.split(/\s+/).filter(Boolean).length >= 2;
}

export function isPlausiblePhone(phone?: string | null): boolean {
  if (!phone?.trim()) return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return true;
  return PHONE_PATTERN.test(phone.trim());
}

export function isPlausibleEmail(email?: string | null): boolean {
  return !!email?.trim() && EMAIL_PATTERN.test(email.trim());
}

export function isPlausibleNpi(npi?: string | null): boolean {
  return /^\d{10}$/.test(npi?.trim() ?? "");
}

export function isPlausibleClaimManagerName(name?: string | null): boolean {
  const n = name?.trim();
  if (!n || n.length < 4) return false;
  if (/\b(PAC|ARNP|MD|DO|DC|ATTENDING|CLAIM MANAGER|FAX|VRC|VOCATIONAL)\b/i.test(n)) {
    return false;
  }
  if (/\b(REVIEW|DATE|STATUS|NEXT|ALLOWED|DEPARTMENT|CORRESPONDENCE|SUPERVISOR|LOCATION)\b/i.test(n)) {
    return false;
  }
  if (
    /\b(STREET|ST\b|AVE|AVENUE|ROAD|RD|BLVD|DEPT|LABOR|INDUSTRIES|UNIT|HIGHWAY|HWY|WAY|LANE|DRIVE|DR)\b/i.test(
      n,
    )
  ) {
    return false;
  }
  if (/\b(AMAZON|FARMS|LLC|INC|CORP|CONSTRUCTION|GEORGES|KIM|CARLT)\b/i.test(n)) {
    return false;
  }
  return isPlausiblePersonName(n);
}

export type RequiredImportField =
  | "attendingDoctor"
  | "claimManager"
  | "employer"
  | "mailingAddress"
  | "residenceAddress"
  | "injuryDate"
  | "vocationalCounselor";

const REQUIRED_FIELD_LABELS: Record<RequiredImportField, string> = {
  attendingDoctor: "Attending doctor",
  claimManager: "Claim Manager",
  employer: "Employer name",
  mailingAddress: "Worker mailing address",
  residenceAddress: "Worker residence address",
  injuryDate: "Injury date",
  vocationalCounselor: "Vocational counselor",
};

/** Fields that must be present on a complete client import. */
export function getMissingRequiredImportFields(
  referral: ParsedReferral | undefined,
  supplement: ClientDocumentSupplement | undefined,
): RequiredImportField[] {
  const missing: RequiredImportField[] = [];

  if (!isPlausibleDoctorName(supplement?.attendingDoctorName)) {
    missing.push("attendingDoctor");
  }
  const claimManagerOk =
    isPlausibleClaimManagerName(supplement?.claimManagerName) &&
    !(
      supplement?.attendingDoctorName &&
      supplement.attendingDoctorName
        .trim()
        .toUpperCase()
        .startsWith(supplement.claimManagerName!.trim().toUpperCase())
    );
  if (!claimManagerOk) {
    missing.push("claimManager");
  }
  if (!isPlausibleEmployerName(supplement?.employerName ?? "")) {
    missing.push("employer");
  }
  if (
    !isPlausibleMailingAddress({
      addressLine1: supplement?.addressLine1,
      city: supplement?.city,
      state: supplement?.state,
      zip: supplement?.zip,
    })
  ) {
    missing.push("mailingAddress");
  }
  if (
    !isPlausibleResidenceAddress({
      residenceAddressLine1: supplement?.residenceAddressLine1,
      residenceCity: supplement?.residenceCity,
      residenceState: supplement?.residenceState,
      residenceZip: supplement?.residenceZip,
    })
  ) {
    missing.push("residenceAddress");
  }
  if (!(referral?.dateOfInjury ?? supplement?.dateOfInjury)) {
    missing.push("injuryDate");
  }
  const vrc = referral?.vrcName?.trim() || supplement?.vrcName?.trim();
  if (!isPlausibleVrcName(vrc)) {
    missing.push("vocationalCounselor");
  }

  return missing;
}

export function formatMissingRequiredFields(fields: RequiredImportField[]): string {
  return fields.map((f) => REQUIRED_FIELD_LABELS[f]).join(", ");
}

export function isPlausibleVrcName(name?: string | null): boolean {
  const n = name?.trim();
  if (!n || n.length < 3) return false;
  if (/^(ASSIGNED VRC|VRC OF RECORD)$/i.test(n)) return false;
  if (/\b(LLC|CONSULTING|SERVICES|VOCATIONAL FIRM)\b/i.test(n) && !isPlausiblePersonName(n)) {
    return false;
  }
  if (/\bVRC\b/i.test(n)) {
    const withoutVrc = n.replace(/\s+VRC\b/i, "").trim();
    if (!withoutVrc || withoutVrc.split(/\s+/).length > 4) return false;
    if (/\b(LLC|CONSULTING|SERVICES|VOCATIONAL COUNSELOR)\b/i.test(withoutVrc)) return false;
    return withoutVrc.length >= 3;
  }
  return isPlausiblePersonName(n) || (n.length >= 3 && n.length <= 40);
}

type AddressFields = Pick<
  ClientDocumentSupplement,
  "addressLine1" | "city" | "state" | "zip"
>;

type ResidenceFields = Pick<
  ClientDocumentSupplement,
  "residenceAddressLine1" | "residenceCity" | "residenceState" | "residenceZip"
>;

function isPlausibleMailingAddress(fields: AddressFields): boolean {
  return (
    isPlausibleWorkerAddress(fields.addressLine1) &&
    !!fields.city?.trim() &&
    !!fields.state?.trim() &&
    !!fields.zip?.trim() &&
    ZIP_PATTERN.test(fields.zip.slice(0, 5))
  );
}

function isPlausibleResidenceAddress(fields: ResidenceFields): boolean {
  return (
    isPlausibleWorkerAddress(fields.residenceAddressLine1) &&
    !!fields.residenceCity?.trim() &&
    !!fields.residenceState?.trim() &&
    !!fields.residenceZip?.trim() &&
    ZIP_PATTERN.test(fields.residenceZip.slice(0, 5))
  );
}

function addressesMatch(mailing: AddressFields, residence: ResidenceFields): boolean {
  return (
    mailing.addressLine1?.trim().toUpperCase() ===
      residence.residenceAddressLine1?.trim().toUpperCase() &&
    mailing.city?.trim().toUpperCase() === residence.residenceCity?.trim().toUpperCase() &&
    mailing.zip?.slice(0, 5) === residence.residenceZip?.slice(0, 5)
  );
}

function mergeDiagnoses(into: string[], from: string[]) {
  const seen = new Set(into.map((c) => c.toUpperCase()));
  for (const code of from) {
    const upper = code.toUpperCase();
    if (!seen.has(upper) && isPlausibleIcdCode(upper)) {
      seen.add(upper);
      into.push(upper);
    }
  }
}

function pickMailingFromParts(parts: ClientDocumentPart[]): AddressFields | undefined {
  for (const { supplement: s } of parts) {
    const candidate = {
      addressLine1: s.addressLine1,
      city: s.city,
      state: s.state,
      zip: s.zip,
    };
    if (isPlausibleMailingAddress(candidate)) return candidate;
  }
  return undefined;
}

function pickResidenceFromParts(
  parts: ClientDocumentPart[],
  mailing?: AddressFields,
): ResidenceFields | undefined {
  for (const { supplement: s } of parts) {
    const candidate = {
      residenceAddressLine1: s.residenceAddressLine1,
      residenceCity: s.residenceCity,
      residenceState: s.residenceState,
      residenceZip: s.residenceZip,
    };
    if (isPlausibleResidenceAddress(candidate)) return candidate;
  }
  if (mailing && isPlausibleMailingAddress(mailing)) {
    return {
      residenceAddressLine1: mailing.addressLine1,
      residenceCity: mailing.city,
      residenceState: mailing.state,
      residenceZip: mailing.zip,
    };
  }
  return undefined;
}

function pickFieldFromParts(
  parts: ClientDocumentPart[],
  read: (s: ClientDocumentSupplement) => string | undefined,
  validate: (value: string) => boolean,
  preferLast = false,
): string | undefined {
  const ordered = preferLast ? [...parts].reverse() : parts;
  for (const { supplement } of ordered) {
    const value = read(supplement)?.trim();
    if (value && validate(value)) return value;
  }
  return undefined;
}

/** Re-merge document parts, preferring values that pass field validation. */
export function mergeDocumentPartsPreferValid(
  parts: ClientDocumentPart[],
): ClientDocumentSupplement {
  const merged: ClientDocumentSupplement = { diagnoses: [], warnings: [] };

  for (const { supplement, filename } of parts) {
    for (const warning of supplement.warnings) {
      merged.warnings.push(`${filename}: ${warning}`);
    }
    mergeDiagnoses(merged.diagnoses, supplement.diagnoses);
  }

  const mailing = pickMailingFromParts(parts);
  if (mailing) {
    merged.addressLine1 = mailing.addressLine1;
    merged.city = mailing.city;
    merged.state = mailing.state;
    merged.zip = mailing.zip;
  }

  const residence = pickResidenceFromParts(parts, mailing);
  if (residence) {
    merged.residenceAddressLine1 = residence.residenceAddressLine1;
    merged.residenceCity = residence.residenceCity;
    merged.residenceState = residence.residenceState;
    merged.residenceZip = residence.residenceZip;
  }

  merged.claimNumber = pickFieldFromParts(
    parts,
    (s) => s.claimNumber,
    (v) => isLniClaimNumber(v),
  );
  merged.clientName = pickFieldFromParts(parts, (s) => s.clientName, isPlausiblePersonName);
  merged.employerName = pickFieldFromParts(parts, (s) => s.employerName, isPlausibleEmployerName);
  merged.attendingDoctorName = pickFieldFromParts(
    parts,
    (s) => s.attendingDoctorName,
    isPlausibleDoctorName,
  );
  merged.attendingDoctorAddress = pickFieldFromParts(
    parts,
    (s) => s.attendingDoctorAddress,
    (v) => v.length >= 10 && !/\b(PERCENT|LIABILITY)\b/i.test(v),
  );
  merged.attendingDoctorPhone = pickFieldFromParts(
    parts,
    (s) => s.attendingDoctorPhone,
    isPlausiblePhone,
  );
  merged.claimManagerName = pickFieldFromParts(
    parts,
    (s) => s.claimManagerName,
    (value) => {
      if (!isPlausibleClaimManagerName(value)) return false;
      const doctor = merged.attendingDoctorName?.trim().toUpperCase();
      if (doctor && doctor.startsWith(value.trim().toUpperCase())) return false;
      return true;
    },
    false,
  );
  merged.claimManagerPhone = pickFieldFromParts(
    parts,
    (s) => s.claimManagerPhone,
    isPlausiblePhone,
    false,
  );
  merged.claimManagerFax = pickFieldFromParts(
    parts,
    (s) => s.claimManagerFax,
    isPlausiblePhone,
    true,
  );
  merged.workerPhone = pickFieldFromParts(parts, (s) => s.workerPhone, isPlausiblePhone);
  merged.vrcName = pickFieldFromParts(parts, (s) => s.vrcName, isPlausibleVrcName);
  merged.vrcPhone = pickFieldFromParts(parts, (s) => s.vrcPhone, isPlausiblePhone);
  merged.legalRepresentativeName = pickFieldFromParts(
    parts,
    (s) => s.legalRepresentativeName,
    (v) => v.length >= 4,
  );
  merged.legalRepresentativeAddress = pickFieldFromParts(
    parts,
    (s) => s.legalRepresentativeAddress,
    (v) => v.length >= 10,
  );
  merged.legalRepresentativePhone = pickFieldFromParts(
    parts,
    (s) => s.legalRepresentativePhone,
    isPlausiblePhone,
  );

  const injuryPart = parts.find(({ supplement }) => supplement.dateOfInjury)?.supplement;
  merged.dateOfInjury = injuryPart?.dateOfInjury;

  return merged;
}

function copyMailingToResidence(supplement: ClientDocumentSupplement): ClientDocumentSupplement {
  if (!isPlausibleMailingAddress(supplement)) return supplement;
  return {
    ...supplement,
    residenceAddressLine1: supplement.addressLine1,
    residenceCity: supplement.city,
    residenceState: supplement.state,
    residenceZip: supplement.zip,
  };
}

function sanitizeSupplement(
  supplement: ClientDocumentSupplement,
  repairs: string[],
): ClientDocumentSupplement {
  let next = { ...supplement };

  if (next.employerName && !isPlausibleEmployerName(next.employerName)) {
    repairs.push(`Cleared invalid employer name: ${next.employerName}`);
    next.employerName = undefined;
  }

  if (!isPlausibleMailingAddress(next)) {
    if (next.addressLine1 || next.city || next.zip) {
      repairs.push("Cleared invalid worker mailing address.");
    }
    next.addressLine1 = undefined;
    next.city = undefined;
    next.state = undefined;
    next.zip = undefined;
  }

  if (!isPlausibleResidenceAddress(next)) {
    if (isPlausibleMailingAddress(next)) {
      repairs.push("Copied mailing address to residence (residence address was invalid).");
      next = copyMailingToResidence(next);
    } else if (next.residenceAddressLine1) {
      repairs.push("Cleared invalid worker residence address.");
      next.residenceAddressLine1 = undefined;
      next.residenceCity = undefined;
      next.residenceState = undefined;
      next.residenceZip = undefined;
    }
  } else if (
    isPlausibleMailingAddress(next) &&
    isPlausibleResidenceAddress(next) &&
    !addressesMatch(next, next)
  ) {
    // Both valid but different is OK — no repair.
  }

  if (next.attendingDoctorName && !isPlausibleDoctorName(next.attendingDoctorName)) {
    repairs.push(`Cleared invalid attending doctor name: ${next.attendingDoctorName}`);
    next.attendingDoctorName = undefined;
  }

  if (next.attendingDoctorPhone && !isPlausiblePhone(next.attendingDoctorPhone)) {
    next.attendingDoctorPhone = undefined;
  }

  if (next.vrcName && !isPlausibleVrcName(next.vrcName)) {
    repairs.push(`Cleared invalid VRC name: ${next.vrcName}`);
    next.vrcName = undefined;
  }

  if (next.claimManagerName && !isPlausibleClaimManagerName(next.claimManagerName)) {
    next.claimManagerName = undefined;
  }

  if (next.workerPhone && !isPlausiblePhone(next.workerPhone)) {
    next.workerPhone = undefined;
  }

  return next;
}

function sanitizeReferral(
  referral: ParsedReferral,
  supplement: ClientDocumentSupplement | undefined,
  context: ImportQualityContext,
  repairs: string[],
): ParsedReferral {
  let next = { ...referral, diagnoses: [...referral.diagnoses] };

  if (next.clientName && !isPlausiblePersonName(next.clientName)) {
    repairs.push(`Referral client name looked invalid; using folder name if available.`);
    next.clientName = context.folderDisplayName ?? undefined;
  }

  if (next.vrcName && !isPlausibleVrcName(next.vrcName)) {
    next.vrcName = undefined;
  }

  if (next.vrcEmail && !isPlausibleEmail(next.vrcEmail)) {
    next.vrcEmail = undefined;
  }

  if (next.vrcPhone && !isPlausiblePhone(next.vrcPhone)) {
    next.vrcPhone = undefined;
  }

  if (next.attendingNpi && !isPlausibleNpi(next.attendingNpi)) {
    repairs.push("Cleared invalid attending NPI.");
    next.attendingNpi = undefined;
  }

  next.diagnoses = next.diagnoses.filter((code) => isPlausibleIcdCode(code));

  return next;
}

/** Validate extracted import data and repair from alternate document parts when needed. */
export function validateAndRepairClientImport(
  referral: ParsedReferral,
  supplement: ClientDocumentSupplement | undefined,
  context: ImportQualityContext = {},
): {
  referral: ParsedReferral;
  supplement: ClientDocumentSupplement | undefined;
  warnings: string[];
} {
  const repairs: string[] = [];
  const warnings: string[] = [];

  let repairedSupplement = supplement;
  if (context.documentParts?.length) {
    const preferred = mergeDocumentPartsPreferValid(context.documentParts);
    if (supplement) {
      repairedSupplement = {
        ...preferred,
        warnings: [...preferred.warnings, ...supplement.warnings],
        diagnoses: preferred.diagnoses.length ? preferred.diagnoses : supplement.diagnoses,
      };
      repairs.push("Re-merged supplement documents using validated field values.");
    } else {
      repairedSupplement = preferred;
    }
  }

  if (repairedSupplement) {
    repairedSupplement = sanitizeSupplement(repairedSupplement, repairs);
  }

  let repairedReferral = sanitizeReferral(referral, repairedSupplement, context, repairs);

  if (
    context.folderClaimNumber &&
    repairedReferral.claimNumber &&
    context.folderClaimNumber !== repairedReferral.claimNumber
  ) {
    warnings.push(
      `Claim number ${repairedReferral.claimNumber} differs from folder; folder claim ${context.folderClaimNumber} is used.`,
    );
    repairedReferral.claimNumber = context.folderClaimNumber;
  }

  for (const repair of repairs) {
    warnings.push(`Data quality: ${repair}`);
  }

  return {
    referral: repairedReferral,
    supplement: repairedSupplement,
    warnings: [...referral.warnings, ...(repairedSupplement?.warnings ?? []), ...warnings],
  };
}
