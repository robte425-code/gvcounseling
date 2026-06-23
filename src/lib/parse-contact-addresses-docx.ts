import {
  isPlausibleEmployerName,
  isPlausiblePersonName,
  isPlausibleWorkerAddress,
  type ParsedLniCacFields,
} from "@/lib/parse-lni-cac-fields";

export type ParsedContactAddressesDocx = Pick<
  ParsedLniCacFields,
  | "clientName"
  | "employerName"
  | "attendingDoctorName"
  | "claimManagerName"
  | "claimManagerPhone"
  | "claimManagerFax"
  | "mailingAddressLine1"
  | "mailingCity"
  | "mailingState"
  | "mailingZip"
  | "residenceAddressLine1"
  | "residenceCity"
  | "residenceState"
  | "residenceZip"
>;

function preprocessRunTogetherAddress(text: string): string {
  return text
    .replace(/(\d+)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d{5})/g, "$1 $2")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLabeledAddress(block: string): Pick<
  ParsedContactAddressesDocx,
  "mailingAddressLine1" | "mailingCity" | "mailingState" | "mailingZip"
> {
  const prepared = preprocessRunTogetherAddress(block);
  const match = prepared.match(
    /(\d+\s+[A-Za-z0-9][A-Za-z0-9\s.'#-]*?)\s+([A-Za-z][A-Za-z\s.'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i,
  );
  if (!match) return {};
  const addressLine1 = match[1]!.trim().toUpperCase();
  if (!isPlausibleWorkerAddress(addressLine1)) return {};
  return {
    mailingAddressLine1: addressLine1,
    mailingCity: match[2]!.trim().toUpperCase(),
    mailingState: match[3]!.trim().toUpperCase(),
    mailingZip: match[4]!.slice(0, 5),
  };
}

/** L&I "Contact & Addresses" Word export (Claimant / Claim Manager / Employer blocks). */
export function parseContactAddressesDocxText(rawText: string): ParsedContactAddressesDocx {
  const text = rawText.replace(/\r\n/g, "\n");
  const result: ParsedContactAddressesDocx = {};

  const claimantName = text.match(/Claimant:\s*([^\n]+)/i)?.[1]?.trim();
  if (claimantName && isPlausiblePersonName(claimantName.toUpperCase())) {
    result.clientName = claimantName.toUpperCase();
  }

  const claimantSection = text.split(/Claimant:/i)[1]?.split(/Attending Physician|Claim Manager|Employer:/i)[0];
  if (claimantSection) {
    const addressBlock =
      claimantSection.match(/Address:\s*\n?\s*([^\n]+(?:\n[^\n]+)?)/i)?.[1] ??
      claimantSection.match(/Email:[^\n]*Address:\s*\n?\s*([^\n]+(?:\n[^\n]+)?)/i)?.[1];
    if (addressBlock) {
      const addr = parseLabeledAddress(addressBlock);
      result.mailingAddressLine1 = addr.mailingAddressLine1;
      result.mailingCity = addr.mailingCity;
      result.mailingState = addr.mailingState;
      result.mailingZip = addr.mailingZip;
      result.residenceAddressLine1 = addr.mailingAddressLine1;
      result.residenceCity = addr.mailingCity;
      result.residenceState = addr.mailingState;
      result.residenceZip = addr.mailingZip;
    }
  }

  const claimManagerSection = text.split(/Claim Manager:/i)[1]?.split(/Claimant's Attorney|Employer:|Attending Physician:/i)[0];
  if (claimManagerSection) {
    const name = claimManagerSection.match(/^([^\n]+)/)?.[1]?.trim();
    if (name && isPlausiblePersonName(name.split(/\s+/).slice(0, 3).join(" ").toUpperCase())) {
      result.claimManagerName = name.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
    }
    result.claimManagerPhone =
      claimManagerSection.match(/Primary\s*\n?\s*(\d{3}-\d{3}-\d{4})/i)?.[1] ??
      claimManagerSection.match(/(\d{3}-\d{3}-\d{4})/)?.[1];
    result.claimManagerFax = claimManagerSection.match(/Fax\s*\n?\s*(\d{3}-\d{3}-\d{4})/i)?.[1];
  }

  const employerSection = text.split(/Employer:/i)[1]?.split(/Employer Representative|Physical Therapist|Surgeon:/i)[0];
  if (employerSection) {
    const employer = employerSection.match(/^([^\n(]+)/)?.[1]?.trim();
    if (employer && isPlausibleEmployerName(employer.toUpperCase())) {
      result.employerName = employer.toUpperCase();
    }
  }

  const physicianSection = text.split(/Attending Physician:/i)[1]?.split(/Attending Physician:|Claim Manager:|Employer:/i)[0];
  if (physicianSection) {
    const doctor = physicianSection.match(/^([^\n]+)/)?.[1]?.trim();
    if (doctor && !/^External Identifier:/i.test(doctor)) {
      result.attendingDoctorName = doctor.toUpperCase();
    }
  }

  return result;
}
