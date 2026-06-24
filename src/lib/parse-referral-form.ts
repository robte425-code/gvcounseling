import { extractClaimNumber, isLniClaimNumber, parseClaimNumber } from "@/lib/constants";
import type { ParsedReferral } from "@/lib/referral-parser";

export type ReferralFormPayload = {
  vrcName: string;
  vrcEmail: string;
  contactMethod?: string;
  vrcPhone?: string;
  clientName: string;
  claimNumbers: string;
  clientDob?: string;
  clientEmail?: string;
  pgapCoach?: string;
  languages?: string;
  genderIdentity?: string;
  priorServices?: string;
  clientHistory?: string;
};

function parseGender(raw?: string): "M" | "F" | "U" | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v.includes("female")) return "F";
  if (v.includes("male")) return "M";
  if (v.includes("other")) return "U";
  return undefined;
}

function parseDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function extractPrimaryClaimNumber(claimNumbers: string): string | undefined {
  for (const part of claimNumbers.split(/[,;\/\n]+/)) {
    const claim = extractClaimNumber(part.trim());
    if (claim && isLniClaimNumber(claim)) return claim;
  }
  const compact = parseClaimNumber(claimNumbers.replace(/[^A-Za-z0-9,\s]/g, " "));
  return extractClaimNumber(compact);
}

export function parsedReferralFromForm(payload: ReferralFormPayload): ParsedReferral {
  const claimNumber = extractPrimaryClaimNumber(payload.claimNumbers);
  return {
    vrcName: payload.vrcName.trim(),
    vrcEmail: payload.vrcEmail.trim(),
    vrcPhone: payload.vrcPhone?.trim(),
    clientName: payload.clientName.trim(),
    claimNumber,
    dateOfBirth: parseDate(payload.clientDob),
    clientEmail: payload.clientEmail?.trim(),
    gender: parseGender(payload.genderIdentity),
    clientHistory: payload.clientHistory?.trim(),
    diagnoses: [],
    warnings: [],
  };
}

export function clientFolderName(claimNumber: string, clientName: string): string {
  return `${parseClaimNumber(claimNumber)} - ${clientName.trim()}`;
}
