import { DIAGNOSIS_LABEL_PATTERN, extractClaimNumber } from "@/lib/constants";

export type ParsedLniCacFields = {
  claimNumber?: string;
  clientName?: string;
  dateOfInjury?: Date;
  employerName?: string;
  attendingDoctorName?: string;
  attendingDoctorAddress?: string;
  attendingDoctorPhone?: string;
  claimManagerName?: string;
  claimManagerPhone?: string;
  claimManagerFax?: string;
  mailingAddressLine1?: string;
  mailingCity?: string;
  mailingState?: string;
  mailingZip?: string;
  residenceAddressLine1?: string;
  residenceCity?: string;
  residenceState?: string;
  residenceZip?: string;
  workerPhone?: string;
  vrcName?: string;
  vrcPhone?: string;
  diagnoses: string[];
  warnings: string[];
};

const LNI_FIELD_LABEL =
  /\b(?:Employer name|Injury date|Attending doctor|Claim Manager|Worker name|Claim number|Status|Diagnosis)\b/i;

export function isPlausiblePersonName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 50) return false;
  if (LNI_FIELD_LABEL.test(n)) return false;
  if (/\b[A-Z]{1,2}\d{5,}\b/.test(n)) return false;
  if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(n)) return false;
  if ((n.match(/\b[A-Z]{2,}\b/g) ?? []).length > 5) return false;
  return /^[A-Z][A-Z\s.'-]+$/i.test(n);
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}

function parseInjuryDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const STREET_SUFFIX =
  "(?:ST|STREET|STE|SUITE|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|BLVD|WAY|CT|COURT|PL|PLACE|HWY|PIKE|SW|SE|NW|NE)";

function parseStreetCityStateZip(text: string): {
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
} {
  const match = text.match(
    new RegExp(
      `(\\d+\\s+[A-Z0-9][A-Z0-9\\s.'#-]*${STREET_SUFFIX}(?:\\s+[A-Z0-9#-]+)?)\\s+([A-Z][A-Z\\s.'-]+),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
      "i",
    ),
  );
  if (!match) return {};
  return {
    addressLine1: match[1]!.trim().toUpperCase(),
    city: match[2]!.trim().toUpperCase(),
    state: match[3]!.trim().toUpperCase(),
    zip: match[4]!.slice(0, 5),
  };
}

function parseAllStreetCityStateZip(text: string) {
  const pattern = new RegExp(
    `(\\d+\\s+[A-Z0-9][A-Z0-9\\s.'#-]*${STREET_SUFFIX}(?:\\s+[A-Z0-9#-]+)?)\\s+([A-Z][A-Z\\s.'-]+),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
    "gi",
  );
  return [...text.matchAll(pattern)].map((match) => ({
    addressLine1: match[1]!.trim().toUpperCase(),
    city: match[2]!.trim().toUpperCase(),
    state: match[3]!.trim().toUpperCase(),
    zip: match[4]!.slice(0, 5),
  }));
}

export function parseWorkerName(text: string): string | undefined {
  const between = text.match(/Worker name\s+([A-Z][A-Z\s.'-]+?)\s+Employer name/i);
  if (between?.[1]) {
    const name = between[1].trim();
    if (isPlausiblePersonName(name)) return name.toUpperCase();
  }

  const ocrFallback = text.match(
    /Employer name\s+(?:[A-Z]{1,2}\d+\s+)?([A-Z][A-Z\s.'-]+?)\s+(?:Injury date|Attending doctor|Claim Manager)/i,
  );
  if (ocrFallback?.[1]) {
    const name = ocrFallback[1].trim();
    if (isPlausiblePersonName(name)) return name.toUpperCase();
  }

  const simple = text.match(
    /Worker name\s+([A-Z][A-Z\s.'-]+?)(?=\s+Employer name|\s+Attending doctor|\s+Claim Manager|$)/i,
  );
  if (simple?.[1]) {
    const name = simple[1].trim();
    if (isPlausiblePersonName(name)) return name.toUpperCase();
  }

  return undefined;
}

function parseEmployerName(text: string): string | undefined {
  const match = text.match(
    /Employer name\s+(?:[A-Z]{1,2}\d+\s+)?([A-Z0-9][A-Z0-9\s&.'-]+?)(?=\s+Attending doctor|\s+Claim Manager|\s+Status|\s+Injury date|\s+Worker name|$)/i,
  );
  return match?.[1]?.trim().toUpperCase();
}

function parseAttendingDoctor(text: string): Pick<
  ParsedLniCacFields,
  "attendingDoctorName" | "attendingDoctorAddress" | "attendingDoctorPhone"
> {
  const sections = text.split(/Attending doctor/i).slice(1);
  const section =
    sections.find((s) => /(?:Billing Phone|Location Phone)/i.test(s)) ??
    sections[sections.length - 1];
  if (!section) return {};

  const name = section.match(
    /^\s*([A-Z][A-Z\s.'-]+?(?:\s+PAC|\s+ARNP|\s+MD|\s+DO)?)(?=\s+(?:Claim Manager|SWEDISH|\d+\s+[A-Z0-9]|Billing Phone|$))/i,
  )?.[1]?.trim();
  const addressMatch = section.match(
    new RegExp(
      `(\\d+\\s+[A-Z0-9][A-Z0-9\\s.'#-]*${STREET_SUFFIX}(?:\\s+[A-Z0-9#-]+)?)\\s+([A-Z][A-Z\\s.'-]+),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
      "i",
    ),
  );
  const phone = section.match(/(?:Billing Phone|Location Phone):\s*([\d-]+)/i)?.[1];

  let attendingDoctorAddress: string | undefined;
  if (addressMatch) {
    attendingDoctorAddress =
      `${addressMatch[1]!.trim()}, ${addressMatch[2]!.trim()}, ${addressMatch[3]!} ${addressMatch[4]!}`.toUpperCase();
  }

  return {
    attendingDoctorName: name?.toUpperCase(),
    attendingDoctorAddress,
    attendingDoctorPhone: phone,
  };
}

function parseClaimManager(text: string): Pick<
  ParsedLniCacFields,
  "claimManagerName" | "claimManagerPhone" | "claimManagerFax"
> {
  const match = text.match(
    /Claim Manager\s+([A-Z][A-Z\s.'-]+?)\s+(\d{3}-\d{3}-\d{4})/i,
  );
  const fax = text.match(/Claim Manager\s+fax\s+(\d{3}-\d{3}-\d{4})/i)?.[1];
  return {
    claimManagerName: match?.[1]?.trim().toUpperCase(),
    claimManagerPhone: match?.[2],
    claimManagerFax: fax,
  };
}

function parseWorkerAddresses(text: string): Pick<
  ParsedLniCacFields,
  | "mailingAddressLine1"
  | "mailingCity"
  | "mailingState"
  | "mailingZip"
  | "residenceAddressLine1"
  | "residenceCity"
  | "residenceState"
  | "residenceZip"
  | "workerPhone"
> {
  const section =
    text.split(/Worker residence address/i)[1] ??
    text.split(/Worker mailing address/i)[1] ??
    text.split(/Worker(?:'s)? mail(?:ing)? address/i)[1];

  if (!section) return {};

  const beforeAttending = section.split(/Attending doctor/i)[0] ?? section;
  const addresses = parseAllStreetCityStateZip(beforeAttending);
  const workerPhone = beforeAttending.match(/\b(\d{3}-\d{3}-\d{4})\b/)?.[1];

  const mailing = addresses[0];
  const residence = addresses[1] ?? addresses[0];

  return {
    mailingAddressLine1: mailing?.addressLine1,
    mailingCity: mailing?.city,
    mailingState: mailing?.state,
    mailingZip: mailing?.zip,
    residenceAddressLine1: residence?.addressLine1,
    residenceCity: residence?.city,
    residenceState: residence?.state,
    residenceZip: residence?.zip,
    workerPhone,
  };
}

function parseVrcContact(text: string): Pick<ParsedLniCacFields, "vrcName" | "vrcPhone"> {
  const matches = [
    ...text.matchAll(/\b((?:[A-Z][A-Z]+(?:\s+[A-Z][A-Z'.-]*){0,4})\s+VRC)\b/gi),
  ];
  const vrcName = matches.at(-1)?.[1]?.trim().toUpperCase();
  if (vrcName) {
    const after = text.split(vrcName).pop() ?? "";
    const vrcPhone = after.match(/(\d{3}-\d{3}-\d{4})/)?.[1];
    return { vrcName, vrcPhone };
  }

  const section = text.split(/Vocational counselor/i)[1];
  if (!section) return {};

  const phoneMatch = section.match(/(\d{3}-\d{3}-\d{4})/);
  return { vrcPhone: phoneMatch?.[1] };
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

export function parseLniCacText(
  rawText: string,
  options?: { requireDiagnoses?: boolean; requireMailingAddress?: boolean },
): ParsedLniCacFields {
  const text = normalizeText(rawText);
  const warnings: string[] = [];

  const claimRaw =
    text.match(/Claim number\s+([A-Z0-9]+)/i)?.[1] ??
    text.match(/\bClaim\s+#?\s*([A-Z]{1,2}\d+)\b/i)?.[1];
  const claimNumber = extractClaimNumber(claimRaw);

  const injuryRaw = text.match(/Injury date\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  const dateOfInjury = parseInjuryDate(injuryRaw);

  const clientName = parseWorkerName(text);
  const employerName = parseEmployerName(text);
  const attending = parseAttendingDoctor(text);
  const claimManager = parseClaimManager(text);
  const addresses = parseWorkerAddresses(text);
  const vrc = parseVrcContact(text);
  const diagnoses = parseDiagnosisCodes(text);

  if (options?.requireDiagnoses && !diagnoses.length) {
    warnings.push("Could not find diagnosis codes in claim status PDF");
  }
  if (!claimNumber) warnings.push("Could not find claim number in claim status PDF");
  if (options?.requireMailingAddress && !addresses.mailingAddressLine1) {
    warnings.push("Could not find worker mailing address");
  }

  return {
    claimNumber,
    clientName,
    dateOfInjury,
    employerName,
    ...attending,
    ...claimManager,
    ...addresses,
    ...vrc,
    diagnoses,
    warnings,
  };
}
