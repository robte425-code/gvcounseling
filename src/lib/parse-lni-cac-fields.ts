import { DIAGNOSIS_LABEL_PATTERN, extractClaimNumber, isPlausibleIcdCode } from "@/lib/constants";

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

const ADDRESS_LINE_TAIL =
  "(?:\\s+(?:UNIT|STE|SUITE|RTE|RM|APT|BLDG)\\s+[A-Z0-9#-]+|\\s+#\\d+|\\s+(?:N|S|E|W|NE|NW|SE|SW)\\b)*";

/** Word exports often run street suffixes into city names (e.g. STSUNNYSIDE). */
function preprocessAddressText(text: string): string {
  let out = text;
  out = out.replace(
    new RegExp(`(${STREET_SUFFIX})(${ADDRESS_LINE_TAIL}?)([A-Z][A-Z]+)(,\\s*[A-Z]{2}\\s+\\d{5})`, "gi"),
    "$1$2 $3$4",
  );
  out = out.replace(
    /((?:P\.?O\.?\s+BOX|PO BOX)\s+\d+)([A-Z][A-Z]+)(,\s*[A-Z]{2}\s+\d{5})/gi,
    "$1 $2$3",
  );
  out = out.replace(
    /(STE|SUITE|UNIT|RM|APT)\s+(\d+)([A-Z][A-Z]+)(,\s*[A-Z]{2}\s+\d{5})/gi,
    "$1 $2 $3$4",
  );
  return out;
}

const STREET_CITY_ZIP_PATTERN = new RegExp(
  `(\\d+\\s+[A-Z0-9][A-Z0-9\\s.'#-]*${STREET_SUFFIX}${ADDRESS_LINE_TAIL})\\s+([A-Z][A-Z\\s.'-]+),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
  "i",
);

const PO_BOX_CITY_ZIP_PATTERN =
  /((?:P\.?O\.?\s+BOX|PO BOX)\s+\d+[A-Z0-9\s#-]*)\s+([A-Z][A-Z\s.'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i;

function parseStreetCityStateZip(text: string): {
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
} {
  const prepared = preprocessAddressText(text);
  const match =
    prepared.match(STREET_CITY_ZIP_PATTERN) ?? prepared.match(PO_BOX_CITY_ZIP_PATTERN);
  if (!match) return {};
  return {
    addressLine1: match[1]!.trim().toUpperCase(),
    city: match[2]!.trim().toUpperCase(),
    state: match[3]!.trim().toUpperCase(),
    zip: match[4]!.slice(0, 5),
  };
}

function parseAllStreetCityStateZip(text: string) {
  const prepared = preprocessAddressText(text);
  const streetPattern = new RegExp(STREET_CITY_ZIP_PATTERN.source, "gi");
  const poBoxPattern =
    /((?:P\.?O\.?\s+BOX|PO BOX)\s+\d+[A-Z0-9\s#-]*)\s+([A-Z][A-Z\s.'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/gi;

  const results: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zip?: string;
  }[] = [];

  for (const match of prepared.matchAll(streetPattern)) {
    results.push({
      addressLine1: match[1]!.trim().toUpperCase(),
      city: match[2]!.trim().toUpperCase(),
      state: match[3]!.trim().toUpperCase(),
      zip: match[4]!.slice(0, 5),
    });
  }
  for (const match of prepared.matchAll(poBoxPattern)) {
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

const ATTENDING_DOCTOR_SIMPLE =
  /\b([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?)\b/i;

function isPlausibleAttendingDoctorSimple(name: string): boolean {
  const n = name.trim().toUpperCase();
  if (!isPlausiblePersonName(n)) return false;
  if (/\b(ATTENDING DOCTOR|LEGAL REPRESENTATIVE|CLAIM MANAGER|EMPLOYER)\b/.test(n)) {
    return false;
  }
  const parts = n.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 4;
}

function parseAttendingDoctorName(text: string): string | undefined {
  const headerCred = text.match(
    new RegExp(
      `Attending doctor\\s+(${ATTENDING_DOCTOR_NAME.source})(?=\\s+Claim Manager)`,
      "i",
    ),
  );
  if (headerCred?.[1]) return headerCred[1].trim().toUpperCase();

  const headerSimple = text.match(
    /Attending doctor\s+([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?)(?=\s+Claim Manager)/i,
  );
  if (headerSimple?.[1] && isPlausibleAttendingDoctorSimple(headerSimple[1])) {
    return headerSimple[1].trim().toUpperCase();
  }

  for (const section of text.split(/Attending doctor/i).slice(1)) {
    const cleaned = section.replace(/^\s*Legal representative\s+/i, "");
    const atStart = cleaned.match(
      new RegExp(`^\\s*(${ATTENDING_DOCTOR_NAME.source})`, "i"),
    );
    if (atStart?.[1]) return atStart[1].trim().toUpperCase();

    const simpleStart = cleaned.match(/^\s*([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?)\b/i);
    if (simpleStart?.[1] && isPlausibleAttendingDoctorSimple(simpleStart[1])) {
      return simpleStart[1].trim().toUpperCase();
    }

    if (/(?:Billing Phone|Location Phone)/i.test(section)) {
      const inSection =
        section.match(ATTENDING_DOCTOR_NAME) ??
        (isPlausibleAttendingDoctorSimple(section.match(ATTENDING_DOCTOR_SIMPLE)?.[1] ?? "")
          ? section.match(ATTENDING_DOCTOR_SIMPLE)
          : null);
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

  const addressMatch =
    section.match(new RegExp(STREET_CITY_ZIP_PATTERN.source, "i")) ??
    preprocessAddressText(section).match(PO_BOX_CITY_ZIP_PATTERN);
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
  const fax =
    text.match(/Claim Manager\s+fax\s+(\d{3}-\d{3}-\d{4})/i)?.[1] ??
    text.match(/\bFax\s+(\d{3}-\d{3}-\d{4})/i)?.[1];

  const isClaimManagerName = (name: string): boolean => {
    const n = name.trim().toUpperCase();
    if (!isPlausiblePersonName(n)) return false;
    if (/\b(PAC|ARNP|MD|DO|DC|APRN|NP|ATTENDING|CLAIM MANAGER|FAX|VRC|VOCATIONAL|REVIEW|DATE|STATUS|NEXT|DEPARTMENT)\b/.test(n)) {
      return false;
    }
    if (
      /\b(STREET|ST\b|AVE|AVENUE|ROAD|RD|BLVD|DEPT|LABOR|INDUSTRIES|UNIT|HIGHWAY|HWY|WAY|LANE|DRIVE|DR)\b/.test(
        n,
      )
    ) {
      return false;
    }
    if (n.split(/\s+/).length < 2 || n.split(/\s+/).length > 5) return false;
    if (
      new RegExp(
        `Attending doctor\\s+${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+[A-Z]\\.?)?\\s+(?:PAC|ARNP|MD|DO|DC|APRN|NP)`,
        "i",
      ).test(text)
    ) {
      return false;
    }
    return true;
  };

  const extractNameFromGarbage = (raw: string): string | undefined => {
    const n = raw.trim().toUpperCase().replace(/^CLAIM MANAGER\s+(?:FAX\s+)?/i, "");
    if (isClaimManagerName(n)) return n;
    const tail = n.match(/([A-Z][A-Z0-9'-]+(?:\s+[A-Z][A-Z0-9'-]+)+)$/);
    if (tail?.[1] && isClaimManagerName(tail[1])) return tail[1];
    return undefined;
  };

  type Candidate = { name: string; phone?: string; index: number };
  const candidates: Candidate[] = [];

  const pickClaimManagerPhone = (after: string): string | undefined => {
    const phones = [...after.matchAll(/(\d{3}-\d{3}-\d{4})/g)].map((m) => m[1]!);
    return (
      phones.find((p) => p.startsWith("360-902")) ??
      phones.find((p) => !/^800-|^888-|^877-/.test(p)) ??
      phones[0]
    );
  };

  const addCandidate = (raw: string, phone: string | undefined, index: number) => {
    const name = extractNameFromGarbage(raw);
    if (name) candidates.push({ name, phone, index });
  };

  for (const match of text.matchAll(
    /Claim Manager\s+(?:Claim Manager\s+|fax\s+|Attending doctor\s+)*([A-Z][A-Z0-9'-]+(?:\s+[A-Z][A-Z0-9'-]+){0,2})(?=\s+(?:\d{3}-\d{3}-\d{4}|Office|Phone|Fax|Nearest|$))/gi,
  )) {
    const after = text.slice(match.index! + match[0].length);
    addCandidate(match[1]!, pickClaimManagerPhone(after), match.index!);
  }

  for (const match of text.matchAll(
    /([A-Z][A-Z0-9'-]+(?:\s+[A-Z][A-Z0-9'-]+)+)\s+(\d{3}-\d{3}-\d{4})/g,
  )) {
    addCandidate(match[1]!, match[2], match.index!);
  }

  const inline = text.match(/Claim Manager\s+([A-Z][A-Z0-9\s.'-]+?)\s+(\d{3}-\d{3}-\d{4})/i);
  if (inline?.[1]) addCandidate(inline[1], inline[2], inline.index ?? 0);

  if (!candidates.length) return { claimManagerFax: fax };

  const score = (c: Candidate) => {
    let s = c.index;
    if (c.phone?.startsWith("360-902")) s += 10_000;
    if (c.phone && /^800-|^888-|^877-/.test(c.phone)) s -= 10_000;
    return s;
  };

  const best = candidates.sort((a, b) => score(b) - score(a))[0]!;
  return {
    claimManagerName: best.name,
    claimManagerPhone: best.phone,
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

function formatVrcCounselorName(raw: string): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    return `${parts[1]!.charAt(0)}${parts[1]!.slice(1).toLowerCase()} ${parts[0]!.charAt(0)}${parts[0]!.slice(1).toLowerCase()}`;
  }
  if (parts.length === 3 && parts[2]!.length <= 2) {
    const first = parts[1]!.charAt(0) + parts[1]!.slice(1).toLowerCase();
    const last = parts[0]!.charAt(0) + parts[0]!.slice(1).toLowerCase();
    return `${first} ${parts[2]!.toUpperCase()}. ${last}`;
  }
  return raw.trim();
}

function parseVrcContact(text: string): Pick<ParsedLniCacFields, "vrcName" | "vrcPhone"> {
  const counselorVrc = text.match(
    /Vocational counselor\s+([A-Z][A-Z]+(?:\s+[A-Z][A-Z'.-]+){0,2})\s+VRC/i,
  )?.[1];
  if (counselorVrc && isPlausiblePersonName(counselorVrc)) {
    const section = text.split(/Vocational counselor/i)[1] ?? "";
    const vrcPhone = section.match(/(\d{3}-\d{3}-\d{4})/)?.[1];
    return { vrcName: formatVrcCounselorName(counselorVrc), vrcPhone };
  }

  const matches = [
    ...text.matchAll(/\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z'.-]+){1,3}\s+VRC)\b/gi),
  ].filter((m) => !/\b(VOCATIONAL|COUNSELOR|SERVICES|FIRM|CONSULTING)\b/i.test(m[1]!));

  const vrcMatch = matches.at(-1)?.[1]?.trim().toUpperCase();
  if (vrcMatch) {
    const withoutSuffix = vrcMatch.replace(/\s+VRC\b/i, "").trim();
    const formatted = formatVrcCounselorName(withoutSuffix);
    const after = text.split(vrcMatch).pop() ?? "";
    const vrcPhone = after.match(/(\d{3}-\d{3}-\d{4})/)?.[1];
    return { vrcName: formatted, vrcPhone };
  }

  const counselorSection = text.split(/Vocational counselor/i)[1];
  if (counselorSection) {
    for (const line of counselorSection.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed || /\b(LLC|INC|SERVICES|CONSULTING|FIRM|SOUND)\b/i.test(trimmed)) {
        continue;
      }
      const person = trimmed.match(/^([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?)$/);
      if (person?.[1] && isPlausiblePersonName(person[1])) {
        const vrcPhone = counselorSection.match(/(\d{3}-\d{3}-\d{4})/)?.[1];
        return { vrcName: formatVrcCounselorName(person[1]), vrcPhone };
      }
    }
  }

  const counselor = text.match(
    /Vocational counselor\s+([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?)/i,
  )?.[1];
  if (counselor && isPlausiblePersonName(counselor) && !/\b(SERVICES|CONSULTING|FIRM|SOUND)\b/i.test(counselor)) {
    const section = text.split(/Vocational counselor/i)[1] ?? "";
    const vrcPhone = section.match(/(\d{3}-\d{3}-\d{4})/)?.[1];
    return { vrcName: formatVrcCounselorName(counselor), vrcPhone };
  }

  const section = counselorSection;
  if (!section) return {};

  const phoneMatch = section.match(/(\d{3}-\d{3}-\d{4})/);
  return { vrcPhone: phoneMatch?.[1] };
}

function parseDiagnosisCodes(text: string): string[] {
  const section = text.split(/Diagnosis and coverage decisions/i)[1] ?? text;
  const codes = new Set<string>();

  for (const match of section.matchAll(/\b([A-TV-Z]\d{2}\.\d+[A-Z0-9]*)\b/g)) {
    const code = match[1]!.toUpperCase();
    if (isPlausibleIcdCode(code)) codes.add(code);
  }

  if (codes.size) return [...codes];

  for (const match of section.matchAll(/\b([A-TV-Z]\d{2}(?:\.\d+)?[A-Z0-9]?)\b/g)) {
    const code = match[1]!.toUpperCase();
    if (isPlausibleIcdCode(code)) codes.add(code);
  }

  if (codes.size) return [...codes];

  const labeled = text.match(
    new RegExp(`${DIAGNOSIS_LABEL_PATTERN.source}[^:\\n]*:\\s*([^\\n]+)`, "i"),
  );
  if (labeled?.[1]) {
    for (const part of labeled[1].split(/[,;\/]+/)) {
      const code = part.trim().toUpperCase();
      if (isPlausibleIcdCode(code)) codes.add(code);
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
