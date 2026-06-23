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
  legalRepresentativeName?: string;
  legalRepresentativeAddress?: string;
  legalRepresentativePhone?: string;
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
  "(?:ST|STREET|STE|SUITE|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|BLVD|WAY|CT|COURT|PL|PLACE|HWY|PIKE|SW|SE|NW|NE|RTE|ROUTE)";

const ADDRESS_LINE_TAIL = "(?:\\s+(?:UNIT|STE|SUITE|RTE|#|RM|APT|BLDG|[A-Z0-9#-]+))*";

function parseStreetCityStateZip(text: string): {
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
} {
  const match = text.match(
    new RegExp(
      `(\\d+\\s+[A-Z0-9][A-Z0-9\\s.'#-]*${STREET_SUFFIX}${ADDRESS_LINE_TAIL})\\s+([A-Z][A-Z\\s.'-]+),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
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
  const streetPattern = new RegExp(
    `(\\d+\\s+[A-Z0-9][A-Z0-9\\s.'#-]*${STREET_SUFFIX}${ADDRESS_LINE_TAIL})\\s+([A-Z][A-Z\\s.'-]+),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
    "gi",
  );
  const poBoxPattern =
    /((?:P\.?O\.?\s+BOX|PO BOX)\s+\d+[A-Z0-9\s#-]*)\s+([A-Z][A-Z\s.'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/gi;

  const results: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zip?: string;
  }[] = [];

  for (const match of text.matchAll(streetPattern)) {
    results.push({
      addressLine1: match[1]!.trim().toUpperCase(),
      city: match[2]!.trim().toUpperCase(),
      state: match[3]!.trim().toUpperCase(),
      zip: match[4]!.slice(0, 5),
    });
  }
  for (const match of text.matchAll(poBoxPattern)) {
    results.push({
      addressLine1: match[1]!.trim().toUpperCase(),
      city: match[2]!.trim().toUpperCase(),
      state: match[3]!.trim().toUpperCase(),
      zip: match[4]!.slice(0, 5),
    });
  }

  return results;
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

const ATTENDING_DOCTOR_NAME =
  /([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?\s+(?:PAC|ARNP|MD|DO|DC|APRN|NP))\b/i;

export function isPlausibleEmployerName(name: string): boolean {
  const n = name.trim().toUpperCase();
  if (!n || n.length < 2) return false;
  if (/\bATTENDING DOCTOR\b/.test(n)) return false;
  if (ATTENDING_DOCTOR_NAME.test(n)) return false;
  if (/\b(ARNP|MD|DO|DC|PAC|NP|APRN)\b/.test(n)) return false;
  if (LNI_FIELD_LABEL.test(n)) return false;
  return true;
}

function parseEmployerFromLiabilityTable(text: string): string | undefined {
  const patterns = [
    /Employer name\(s\)\s+Percent of liability\s*>\s*([A-Z0-9][A-Z0-9\s&.'-]+?)\s+\d+\s+percent/i,
    /Employer name\(s\)\s*>\s*([A-Z0-9][A-Z0-9\s&.'-]+?)(?=\s+Vocational firm|\s+Percent|\s+\d+\s+percent|$)/i,
  ];
  for (const pattern of patterns) {
    const name = pattern.exec(text)?.[1]?.trim().toUpperCase();
    if (name && isPlausibleEmployerName(name)) return name;
  }
  return undefined;
}

function parseEmployerName(text: string): string | undefined {
  if (/Employer name\s+Attending doctor/i.test(text)) {
    return parseEmployerFromLiabilityTable(text);
  }

  const match = text.match(
    /Employer name\s+(?:[A-Z]{1,2}\d+\s+)?([A-Z0-9][A-Z0-9\s&.'-]+?)(?=\s+Attending doctor|\s+Claim Manager|\s+Status|\s+Injury date|\s+Worker name|$)/i,
  );
  const name = match?.[1]?.trim().toUpperCase();
  if (name && isPlausibleEmployerName(name)) return name;

  return parseEmployerFromLiabilityTable(text);
}

function parseAttendingDoctorName(text: string): string | undefined {
  const header = text.match(
    new RegExp(
      `Attending doctor\\s+(${ATTENDING_DOCTOR_NAME.source})(?=\\s+Claim Manager)`,
      "i",
    ),
  );
  if (header?.[1]) return header[1].trim().toUpperCase();

  for (const section of text.split(/Attending doctor/i).slice(1)) {
    const cleaned = section.replace(/^\s*Legal representative\s+/i, "");
    const atStart = cleaned.match(
      new RegExp(`^\\s*(${ATTENDING_DOCTOR_NAME.source})`, "i"),
    );
    if (atStart?.[1]) return atStart[1].trim().toUpperCase();

    if (/(?:Billing Phone|Location Phone)/i.test(section)) {
      const inSection = section.match(ATTENDING_DOCTOR_NAME);
      if (inSection?.[1]) return inSection[1].trim().toUpperCase();
    }
  }

  return undefined;
}

function parseAttendingDoctor(text: string): Pick<
  ParsedLniCacFields,
  "attendingDoctorName" | "attendingDoctorAddress" | "attendingDoctorPhone"
> {
  const sections = text.split(/Attending doctor/i).slice(1);
  const section =
    sections.find((s) => /(?:Billing Phone|Location Phone)/i.test(s)) ??
    sections[sections.length - 1];

  const name = parseAttendingDoctorName(text);
  if (!section) return { attendingDoctorName: name };

  const addressMatch = section.match(
    new RegExp(
      `(\\d+\\s+[A-Z0-9][A-Z0-9\\s.'#-]*${STREET_SUFFIX}${ADDRESS_LINE_TAIL})\\s+([A-Z][A-Z\\s.'-]+),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
      "i",
    ),
  );
  const phone =
    section.match(/Location Phone:\s*([\d-]+)/i)?.[1] ??
    section.match(/Billing Phone:\s*([\d-]+)/i)?.[1];

  let attendingDoctorAddress: string | undefined;
  if (addressMatch) {
    attendingDoctorAddress =
      `${addressMatch[1]!.trim()}, ${addressMatch[2]!.trim()}, ${addressMatch[3]!} ${addressMatch[4]!}`.toUpperCase();
  }

  return {
    attendingDoctorName: name,
    attendingDoctorAddress,
    attendingDoctorPhone: phone,
  };
}

function looksLikeLegalFirm(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 4) return false;
  if (
    /\b(HEALTH|CLINIC|HOSPITAL|MEDICAL|ORTHOP|OCCUPATIO|WORK INJURY|FAMILY MED|PRIMARY|SWEDISH|MED GRP|ROBINSON AND KOLE)\b/i.test(
      n,
    )
  ) {
    return false;
  }
  return /\b(LAW CENTER|LAW GROUP|LAW FIRM|JUSTICE|ATTORNEY|ATTORNEYS|LLC|PLLC|AXION LAW|LEGAL)\b/i.test(
    n,
  );
}

function parseLegalFirmName(afterDoctor: string): string | undefined {
  const patterns = [
    /^([A-Z0-9][A-Z0-9\s&.',-]+?(?:LLC\.?|L\.L\.C\.?|PLLC\.?))\s+/i,
    /^([A-Z][A-Z0-9\s&.',-]*LAW CENTER)\s+/i,
    /^([A-Z][A-Z0-9\s&.',-]*LAW GROUP)\s+/i,
    /^([A-Z0-9][A-Z0-9\s&.',-]+JUSTICE,?\s*LLC\.?)\s+/i,
  ];
  for (const pattern of patterns) {
    const match = afterDoctor.match(pattern);
    if (match?.[1] && looksLikeLegalFirm(match[1])) {
      return match[1].trim().replace(/\.$/, "").toUpperCase();
    }
  }
  return undefined;
}

function parseGeneralPhone(section: string): string | undefined {
  const stripped = section
    .replace(/Billing Phone:\s*[\d-]*/gi, "")
    .replace(/Location Phone:\s*[\d-]*/gi, "");
  return stripped.match(/Phone:\s*([\d-]+)/i)?.[1];
}

function formatAddress(addr: {
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string | undefined {
  if (!addr.addressLine1) return undefined;
  return `${addr.addressLine1}, ${addr.city ?? ""}, ${addr.state ?? ""} ${addr.zip ?? ""}`
    .replace(/,\s*,/g, ",")
    .trim()
    .toUpperCase();
}

function parseLegalRepresentative(text: string): Pick<
  ParsedLniCacFields,
  "legalRepresentativeName" | "legalRepresentativeAddress" | "legalRepresentativePhone"
> {
  const section = text.match(
    /Attending doctor\s+Legal representative\s+([\s\S]+?)(?=View\s*>|Employer name|Vocational firm|Surgical Coordinator|$)/i,
  )?.[1];
  if (!section) return {};

  const doctorMatch = section.match(ATTENDING_DOCTOR_NAME);
  if (!doctorMatch?.[1]) return {};

  const afterDoctor = section.slice(section.indexOf(doctorMatch[1]) + doctorMatch[1].length).trim();
  const legalRepresentativeName = parseLegalFirmName(afterDoctor);
  if (!legalRepresentativeName) return {};

  const addresses = parseAllStreetCityStateZip(section);
  const legalAddress =
    addresses.length >= 2
      ? addresses[addresses.length - 1]
      : addresses.find((a) => /PO BOX|\bBOX\b/i.test(a.addressLine1 ?? ""));

  return {
    legalRepresentativeName,
    legalRepresentativeAddress: legalAddress ? formatAddress(legalAddress) : undefined,
    legalRepresentativePhone: parseGeneralPhone(section),
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

export function isPlausibleWorkerAddress(addressLine1?: string): boolean {
  if (!addressLine1) return false;
  const line = addressLine1.trim().toUpperCase();
  if (
    /\b(PERCENT|LIABILITY|VOCATIONAL|COUNSELOR|CLAIM MANAGER|EMPLOYER NAME)\b/.test(line) ||
    /\bVRC\b/.test(line)
  ) {
    return false;
  }
  return true;
}

function firstPlausibleAddress(text: string) {
  return parseAllStreetCityStateZip(text).find((a) =>
    isPlausibleWorkerAddress(a.addressLine1),
  );
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
  const mailingBlock = text.match(
    /Worker mailing address\s+(.*?)\s+Worker residence address/i,
  )?.[1];
  const residenceBlock = text.match(
    /Worker residence address\s+(.*?)(?=Attending doctor|Percent of liability|Vocational firm|Employer name|$)/i,
  )?.[1];

  if (mailingBlock || residenceBlock) {
    const mailing =
      firstPlausibleAddress(mailingBlock ?? "") ??
      firstPlausibleAddress(residenceBlock ?? "");
    const residence =
      firstPlausibleAddress(residenceBlock ?? "") ?? mailing;
    const phoneSource = residenceBlock ?? mailingBlock ?? "";
    const workerPhone = phoneSource.match(/\b(\d{3}-\d{3}-\d{4})\b/)?.[1];

    const resolvedResidence = residence ?? mailing;
    return {
      mailingAddressLine1: mailing?.addressLine1,
      mailingCity: mailing?.city,
      mailingState: mailing?.state,
      mailingZip: mailing?.zip,
      residenceAddressLine1: resolvedResidence?.addressLine1,
      residenceCity: resolvedResidence?.city,
      residenceState: resolvedResidence?.state,
      residenceZip: resolvedResidence?.zip,
      workerPhone,
    };
  }

  const section =
    text.split(/Worker residence address/i)[1] ??
    text.split(/Worker mailing address/i)[1] ??
    text.split(/Worker(?:'s)? mail(?:ing)? address/i)[1];

  if (!section) return {};

  const beforeAttending = section.split(/Attending doctor/i)[0] ?? section;
  const addresses = parseAllStreetCityStateZip(beforeAttending).filter((a) =>
    isPlausibleWorkerAddress(a.addressLine1),
  );
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
  const legalRepresentative = parseLegalRepresentative(text);
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
    ...legalRepresentative,
    ...claimManager,
    ...addresses,
    ...vrc,
    diagnoses,
    warnings,
  };
}
