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

const DOCTOR_CREDENTIAL = /\b(PAC|ARNP|MD|DO|DC|APRN|NP)\b/i;
const ATTENDING_LABEL = /Attending\s+(?:Physician|Doctor)\s*:?/i;
const SECTION_BREAK =
  /Claimant's Attorney:|Employer:|Claim Manager:|Attending\s+(?:Physician|Doctor)\s*:?|Physical Therapist:|Surgeon:/i;

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

/** Skip L&I metadata lines and return the first plausible person/doctor name. */
function firstPersonNameLine(section: string): string | undefined {
  for (const raw of section.split("\n")) {
    const line = raw.trim().replace(/\s+/g, " ");
    if (!line) continue;
    if (
      /^(External Identifier|Address|Phone|Fax|Email|Specialty|NPI|Location|Primary)\b/i.test(
        line,
      )
    ) {
      continue;
    }
    const upper = line.toUpperCase();
    if (DOCTOR_CREDENTIAL.test(upper) || isPlausiblePersonName(upper)) {
      return upper;
    }
  }
  return undefined;
}

/** L&I "Contact & Addresses" Word export (Claimant / Claim Manager / Employer blocks). */
export function parseContactAddressesDocxText(rawText: string): ParsedContactAddressesDocx {
  const text = rawText.replace(/\r\n/g, "\n");
  const result: ParsedContactAddressesDocx = {};

  const claimantName = text.match(/Claimant:\s*([^\n]+)/i)?.[1]?.trim();
  if (claimantName && isPlausiblePersonName(claimantName.toUpperCase())) {
    result.clientName = claimantName.toUpperCase();
  }

  const claimantSection = text
    .split(/Claimant:/i)[1]
    ?.split(new RegExp(`${ATTENDING_LABEL.source}|Claim Manager|Employer:`, "i"))[0];
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

  const claimManagerSection = text.split(/Claim Manager:/i)[1]?.split(SECTION_BREAK)[0];
  if (claimManagerSection) {
    const name = firstPersonNameLine(claimManagerSection);
    if (name) {
      result.claimManagerName = name.split(/\s+/).slice(0, 3).join(" ");
    }
    result.claimManagerPhone =
      claimManagerSection.match(/Primary\s*\n?\s*(\d{3}-\d{3}-\d{4})/i)?.[1] ??
      claimManagerSection.match(/(\d{3}-\d{3}-\d{4})/)?.[1];
    result.claimManagerFax = claimManagerSection.match(/Fax\s*\n?\s*(\d{3}-\d{3}-\d{4})/i)?.[1];
  }

  const employerSection = text
    .split(/Employer:/i)[1]
    ?.split(/Employer Representative|Physical Therapist|Surgeon:|Attending\s+(?:Physician|Doctor)/i)[0];
  if (employerSection) {
    const employer = employerSection.match(/^([^\n(]+)/)?.[1]?.trim();
    if (employer && isPlausibleEmployerName(employer.toUpperCase())) {
      result.employerName = employer.toUpperCase();
    }
  }

  // L&I Word exports often put "External Identifier: …" on the first line under
  // Attending Physician/Doctor; the previous parser skipped that line and never
  // read the doctor name on the following line (CM still worked because its name
  // is usually the first line).
  const physicianSection = text.split(ATTENDING_LABEL)[1]?.split(SECTION_BREAK)[0];
  if (physicianSection) {
    const doctor = firstPersonNameLine(physicianSection);
    if (doctor) {
      result.attendingDoctorName = doctor;
    }
  }

  return result;
}
