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
  if (n.endsWith(".")) {
    const trimmed = n.slice(0, -1);
    if (trimmed.length >= 4 && /^[A-Z][A-Z\s.'-]+$/i.test(trimmed)) return true;
  }
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

/** OCR/screenshots often put worker, employer, doctor, and CM on separate lines after injury date. */
function parseLineStackedFields(rawText: string): Partial<ParsedLniCacFields> {
  const injuryMatch =
    rawText.match(/Injury dat(?:e)?\s+(\d{1,2}\/\d{1,2}\/\d{4})/i) ??
    rawText.match(/Injury dat(?:e)?\s*\n\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (!injuryMatch) return {};

  const afterInjury = rawText.slice(injuryMatch.index! + injuryMatch[0].length);
  const section = afterInjury.split(
    /Worker mailing address|Worker residence address|Worker's mail will be sent to/i,
  )[0] ?? "";
  const lines = section
    .split(/\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(Get Claim|Enter Claim|Claim number|Worker name|Employer name|Attending doctor|Claim Manager|Claim Manager fax)$/i.test(
          l,
        ) &&
        !/^[A-Z]{2}\d{5,6}$/.test(l),
    );

  let cmIdx = -1;
  let claimManagerName = "";
  let claimManagerPhone = "";
  let claimManagerFax = "";
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^([A-Z][A-Z\s.'-]+?)\s+(360-902-\d{3,4})\s*$/);
    if (!match) continue;
    const name = match[1]!.trim().toUpperCase();
    if (/\b(PAC|ARNP|MD|DO|DC|APRN|NP)\b/.test(name)) continue;
    if (!isPlausiblePersonName(name)) continue;
    cmIdx = i;
    claimManagerName = name;
    claimManagerPhone = match[2]!;
    const nextLine = lines[i + 1]?.trim();
    if (
      nextLine &&
      /^\d{3}-\d{3}-\d{4}$/.test(nextLine) &&
      nextLine !== claimManagerPhone &&
      nextLine.startsWith("360-902")
    ) {
      claimManagerFax = nextLine;
    }
    break;
  }
  if (cmIdx < 0) return { dateOfInjury: parseInjuryDate(injuryMatch[1]) };

  let doctorIdx = cmIdx - 1;
  while (doctorIdx >= 0 && /^\d{3}-\d{3}-\d{4}$/.test(lines[doctorIdx]!)) doctorIdx--;
  const doctorRaw = lines[doctorIdx]?.toUpperCase().replace(/\s+AMD\s*$/i, " MD") ?? "";
  if (!/\b(PAC|ARNP|MD|DO|DC|APRN|NP)\b/i.test(doctorRaw)) {
    return { dateOfInjury: parseInjuryDate(injuryMatch[1]) };
  }

  const worker = lines[0]?.toUpperCase() ?? "";
  const employer = lines.slice(1, doctorIdx).join(" ").toUpperCase();
  if (!isPlausiblePersonName(worker) || !isPlausibleEmployerName(employer)) {
    return { dateOfInjury: parseInjuryDate(injuryMatch[1]) };
  }

  return {
    dateOfInjury: parseInjuryDate(injuryMatch[1]),
    clientName: worker,
    employerName: employer,
    attendingDoctorName: doctorRaw,
    claimManagerName,
    claimManagerPhone,
    claimManagerFax: claimManagerFax || undefined,
  };
}

/** Screenshot CAC exports stack worker/employer/doctor/claim manager after the injury date. */
function parseCompactStackedFields(text: string): Partial<ParsedLniCacFields> {
  const injuryMatch = text.match(/Injury dat(?:e)?\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (!injuryMatch) return {};

  const afterInjury = text.slice(injuryMatch.index! + injuryMatch[0].length);
  const endMarkers = [
    "Worker mailing address",
    "Worker residence address",
    "Worker mailing",
    "Status",
    "Attending doctor",
    "Percent of liability",
    "> Doctors",
  ];
  let endIdx = afterInjury.length;
  for (const marker of endMarkers) {
    const i = afterInjury.search(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    if (i >= 0 && i < endIdx) endIdx = i;
  }

  const block = afterInjury.slice(0, endIdx).trim();

  let cmMatch: RegExpMatchArray | undefined;
  for (const match of block.matchAll(
    /([A-Z][A-Z]+\s+[A-Z][A-Z'-]+)\s+(360-902-\d{3,4})(?:\s+360-902-4567|\s|$)/g,
  )) {
    const name = match[1]!.trim().toUpperCase();
    if (/\b(PAC|ARNP|MD|DO|DC|APRN|NP)\b/.test(name)) continue;
    if (!isPlausiblePersonName(name)) continue;
    cmMatch = match;
  }
  if (!cmMatch) return { dateOfInjury: parseInjuryDate(injuryMatch[1]) };

  const claimManagerName = cmMatch[1]!.trim().toUpperCase();
  const claimManagerPhone = cmMatch[2]!;
  const beforeCm = block.slice(0, cmMatch.index!).trim();
  const allWords = beforeCm.split(/\s+/).filter(Boolean);

  let best:
    | {
        score: number;
        clientName: string;
        employerName: string;
        attendingDoctorName: string;
        claimManagerName: string;
        claimManagerPhone: string;
      }
    | undefined;

  const minDoctorWords = allWords.length >= 8 ? 4 : 3;

  for (let doctorWords = Math.min(6, allWords.length - 2); doctorWords >= minDoctorWords; doctorWords--) {
    const doctor = allWords.slice(-doctorWords).join(" ");
    if (!/\b(PAC|ARNP|MD|DO|DC|APRN|NP)\s*$/i.test(doctor)) continue;
    const doctorName = doctor.replace(/\s+(PAC|ARNP|MD|DO|DC|APRN|NP)\s*$/i, "").trim();
    if (!isPlausiblePersonName(doctorName)) continue;
    if (/\b(COM|LLC|INC|CORP|DEDC|FARMS|CONSTRUCTION|AMAZON|INDUSTRIES)\b/i.test(doctorName)) {
      continue;
    }

    const rest = allWords.slice(0, -doctorWords);
    const minWorkerWords = rest.length >= 5 ? 3 : 2;
    for (let workerWords = minWorkerWords; workerWords <= Math.min(4, rest.length - 1); workerWords++) {
      const worker = rest.slice(0, workerWords).join(" ");
      const employer = rest.slice(workerWords).join(" ");
      if (!isPlausiblePersonName(worker) || !isPlausibleEmployerName(employer)) continue;

      let score = employer.length + doctorWords * 10;
      if (/\b(COM|LLC|INC|CORP|DEDC|FARMS|CONSTRUCTION|AMAZON|INDUSTRIES|SERVICES)\b/i.test(employer)) {
        score += 20;
      }
      if (workerWords === 3) score += 30;
      if (workerWords === 4) score += 10;

      if (!best || score > best.score) {
        best = {
          score,
          clientName: worker.toUpperCase(),
          employerName: employer.toUpperCase(),
          attendingDoctorName: doctor.toUpperCase(),
          claimManagerName,
          claimManagerPhone,
        };
      }
    }
  }

  if (best) {
    const { score: _score, ...fields } = best;
    return {
      dateOfInjury: parseInjuryDate(injuryMatch[1]),
      ...fields,
    };
  }

  return { dateOfInjury: parseInjuryDate(injuryMatch[1]) };
}

/** OCR/screenshot stacks worker → employer → doctor → CM after claim number when injury date is missing. */
function parseAfterClaimNumberStack(text: string): Partial<ParsedLniCacFields> {
  const claimMatch = text.match(/\b([A-Z]{2}\d{5,6})\b/);
  if (!claimMatch) return {};

  const afterClaim = text.slice(claimMatch.index! + claimMatch[0].length);
  const endIdx = afterClaim.search(
    /Worker(?:'s)? mail(?:ing)?|Worker residence|Percent of liability/i,
  );
  const block = (endIdx >= 0 ? afterClaim.slice(0, endIdx) : afterClaim).trim();
  if (!block || /Injury dat(?:e)?\s+\d{1,2}\/\d{1,2}\/\d{4}/i.test(block)) return {};

  let cmMatch: RegExpMatchArray | undefined;
  for (const match of block.matchAll(
    /([A-Z][A-Z]+\s+[A-Z][A-Z'-]+)\s+(360-902-\d{3,4})(?:\s+360-902-4567|\s|$)/g,
  )) {
    const name = match[1]!.trim().toUpperCase();
    if (/\b(PAC|ARNP|MD|DO|DC|APRN|NP|AMAZON|FARMS|COM|LLC|INC)\b/.test(name)) continue;
    if (!isPlausiblePersonName(name)) continue;
    cmMatch = match;
  }
  if (!cmMatch) {
    const faxMatches = [
      ...block.matchAll(/([A-Z][A-Z]+\s+[A-Z][A-Z'-]+)\s+360-902-4567/g),
    ];
    const faxCm = faxMatches.at(-1)?.[1]?.trim().toUpperCase();
    if (faxCm && isPlausiblePersonName(faxCm) && !/\b(AMAZON|GEORGES|KIM|GET)\b/.test(faxCm)) {
      cmMatch = [faxCm, undefined, faxCm] as unknown as RegExpMatchArray;
      cmMatch.index = block.lastIndexOf(faxCm);
    }
  }
  if (!cmMatch) return {};

  const beforeCm = block.slice(0, cmMatch.index!).trim();
  const allWords = beforeCm.split(/\s+/).filter(Boolean);
  const minDoctorWords = allWords.length >= 8 ? 4 : 3;

  for (let doctorWords = Math.min(6, allWords.length - 2); doctorWords >= minDoctorWords; doctorWords--) {
    const doctor = allWords.slice(-doctorWords).join(" ").replace(/\.$/, "");
    const hasCredential = /\b(PAC|ARNP|MD|DO|DC|APRN|NP)\s*$/i.test(doctor);
    const doctorName = doctor.replace(/\s+(PAC|ARNP|MD|DO|DC|APRN|NP)\s*$/i, "").trim();
    if (!hasCredential && doctorWords > 2) continue;
    if (/\b(COM|LLC|INC|CORP|DEDC|FARMS|CONSTRUCTION|AMAZON|INDUSTRIES)\b/i.test(doctorName)) {
      continue;
    }
    if (!hasCredential && !isPlausiblePersonName(doctorName)) continue;
    if (hasCredential && !isPlausiblePersonName(doctorName)) continue;

    const rest = allWords.slice(0, -doctorWords);
    const minWorkerWords = rest.length >= 5 ? 3 : 2;
    for (let workerWords = minWorkerWords; workerWords <= Math.min(4, rest.length - 1); workerWords++) {
      const worker = rest.slice(0, workerWords).join(" ").replace(/\.$/, "");
      const employer = rest.slice(workerWords).join(" ");
      if (!isPlausiblePersonName(worker) || !isPlausibleEmployerName(employer)) continue;

      return {
        claimNumber: claimMatch[1],
        clientName: worker.toUpperCase(),
        employerName: employer.toUpperCase(),
        attendingDoctorName: doctor.toUpperCase(),
        claimManagerName: cmMatch[1]!.trim().toUpperCase(),
        claimManagerPhone: cmMatch[2],
      };
    }
  }

  return {};
}

const STREET_SUFFIX =
  "(?:STREET|SUITE|AVENUE|DRIVE|LANE|COURT|PLACE|ROUTE|ROAD|BLVD|WAY|HWY|PIKE|ST\\b|STE\\b|AVE\\b|RD\\b|DR\\b|LN\\b|CT\\b|PL\\b|SW\\b|SE\\b|NW\\b|NE\\b|RTE\\b)";

const ADDRESS_LINE_TAIL =
  "(?:\\s+(?:UNIT|STE|SUITE|RTE|RM|APT|BLDG|DEPT)\\s+[A-Z0-9#-]+|\\s+#\\d+|\\s+(?:N|S|E|W|NE|NW|SE|SW)\\b)*";

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

const RELAXED_STREET_CITY_ZIP_PATTERN =
  /(\d+\s+[A-Z0-9][A-Z0-9\s.'#-]{3,}?)\s+([A-Z][A-Z\s.'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/gi;

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
  for (const match of prepared.matchAll(RELAXED_STREET_CITY_ZIP_PATTERN)) {
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
  /([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?\s+(?:PAC|ARNP|MD|DO|DC|APRN|NP|ND))\b/i;

export function isPlausibleEmployerName(name: string): boolean {
  const n = name.trim().toUpperCase();
  if (!n || n.length < 2) return false;
  if (/\bATTENDING DOCTOR\b/.test(n)) return false;
  if (ATTENDING_DOCTOR_NAME.test(n)) return false;
  if (/\b(ARNP|MD|DO|DC|PAC|NP|APRN|ND)\b/.test(n)) return false;
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
  if (name && isPlausibleEmployerName(name)) {
    const worker = parseWorkerName(text);
    if (worker && name === worker) return parseEmployerFromLiabilityTable(text);
    return name;
  }

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

  const sections = text.split(/Attending doctor/i).slice(1);

  for (const section of sections) {
    if (!/(?:Billing Phone|Location Phone)/i.test(section)) continue;
    const trimmed = trimAttendingDoctorSection(section);
    const atStart = trimmed.match(
      new RegExp(`^\\s*(${ATTENDING_DOCTOR_NAME.source})`, "im"),
    );
    if (atStart?.[1]) return atStart[1].trim().toUpperCase();
    const inSection = trimmed.match(ATTENDING_DOCTOR_NAME);
    if (inSection?.[1]) return inSection[1].trim().toUpperCase();
  }

  for (const section of sections) {
    const cleaned = section.replace(/^\s*Legal representative\s+/i, "");
    const credInSection = cleaned.match(ATTENDING_DOCTOR_NAME);
    if (credInSection?.[1]) return credInSection[1].trim().toUpperCase();

    const atStart = cleaned.match(
      new RegExp(`^\\s*(${ATTENDING_DOCTOR_NAME.source})`, "i"),
    );
    if (atStart?.[1]) return atStart[1].trim().toUpperCase();

    const simpleStart = cleaned.match(/^\s*([A-Z][A-Z]+\s+[A-Z][A-Z]+(?:\s+[A-Z]\.?)?)\b/i);
    if (simpleStart?.[1] && isPlausibleAttendingDoctorSimple(simpleStart[1])) {
      if (
        /\b(GOURMET|SANDWICH|RESTAUR|FIRE PROTECTION|COUNTY|LLC|INC|CORP|SERVICES|HEALTH|HOSPITAL|CLINIC|INDUSTRIES|CONSTRUCTION|AMAZON|FARMS)\b/i.test(
          cleaned.slice(0, 250),
        )
      ) {
        continue;
      }
      return simpleStart[1].trim().toUpperCase();
    }
  }

  return undefined;
}

function trimAttendingDoctorSection(section: string): string {
  const endMarkers = [
    /View\s*>/i,
    /Employer name/i,
    /Vocational firm/i,
    /Percent of liability/i,
    /Surgical Coordinator/i,
  ];
  let end = section.length;
  for (const marker of endMarkers) {
    const i = section.search(marker);
    if (i >= 0 && i < end) end = i;
  }
  return section.slice(0, end);
}

function parseAttendingDoctor(text: string): Pick<
  ParsedLniCacFields,
  "attendingDoctorName" | "attendingDoctorAddress" | "attendingDoctorPhone"
> {
  const sections = text.split(/Attending doctor/i).slice(1);
  const rawSection =
    sections.find((s) => /(?:Billing Phone|Location Phone)/i.test(s)) ??
    sections[sections.length - 1];
  const section = rawSection ? trimAttendingDoctorSection(rawSection) : undefined;

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
    if (n.split(/\s+/).length < 2 || n.split(/\s+/).length > 3) return false;
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

function parseOcrLinePairAddresses(rawText: string) {
  const results: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zip?: string;
  }[] = [];
  const lines = rawText.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    const cityMatch = lines[i + 1]!.match(
      /^([A-Z][A-Z\s.'-]+),\s*(WA|OR|ID)\s+(\d{5}(?:-\d{4})?)$/i,
    );
    if (!cityMatch) continue;
    const street = lines[i]!;
    if (!/^\d+\s+/.test(street)) continue;
    if (
      !/(?:STREET|SUITE|AVENUE|DRIVE|LANE|COURT|PLACE|ROAD|BLVD|WAY|HWY|ST\b|STE\b|AVE\b|RD\b|DR\b|LN\b|CT\b|PL\b|SW\b|SE\b|NW\b|NE\b)/i.test(
        street,
      )
    ) {
      continue;
    }
    results.push({
      addressLine1: street.toUpperCase(),
      city: cityMatch[1]!.trim().toUpperCase(),
      state: cityMatch[2]!.trim().toUpperCase(),
      zip: cityMatch[3]!.slice(0, 5),
    });
  }
  return results;
}

function firstPlausibleAddress(text: string, rawText?: string) {
  const fromLines = rawText ? parseOcrLinePairAddresses(rawText) : [];
  const lineHit = fromLines.find((a) => isPlausibleWorkerAddress(a.addressLine1));
  if (lineHit) return lineHit;
  return parseAllStreetCityStateZip(text).find((a) =>
    isPlausibleWorkerAddress(a.addressLine1),
  );
}

function parseWorkerAddresses(
  text: string,
  rawText?: string,
): Pick<
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
      firstPlausibleAddress(mailingBlock ?? "", rawText) ??
      firstPlausibleAddress(residenceBlock ?? "", rawText);
    const residence =
      firstPlausibleAddress(residenceBlock ?? "", rawText) ?? mailing;
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
  const linePairAddresses = rawText ? parseOcrLinePairAddresses(rawText) : [];
  const addresses = (
    linePairAddresses.length
      ? linePairAddresses
      : parseAllStreetCityStateZip(beforeAttending)
  ).filter((a) => isPlausibleWorkerAddress(a.addressLine1));
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

function pickStackedFields(
  lineStacked: Partial<ParsedLniCacFields>,
  compact: Partial<ParsedLniCacFields>,
): Partial<ParsedLniCacFields> {
  const pick = <K extends keyof ParsedLniCacFields>(key: K): ParsedLniCacFields[K] | undefined =>
    lineStacked[key] ?? compact[key];

  return {
    claimNumber: pick("claimNumber"),
    clientName: pick("clientName"),
    dateOfInjury: pick("dateOfInjury"),
    employerName: pick("employerName"),
    attendingDoctorName: pick("attendingDoctorName"),
    claimManagerName: pick("claimManagerName"),
    claimManagerPhone: pick("claimManagerPhone"),
    claimManagerFax: pick("claimManagerFax"),
  };
}

/** Medical clinic fax cover sheets with inline L&I claim fields (e.g. Kareo referral PDFs). */
function parseMedicalReferralFaxFields(rawText: string): Partial<ParsedLniCacFields> {
  if (!/Claim number\s+[A-Z]{1,2}\d+\s+Injury date\s+\d/i.test(rawText)) return {};

  const claimNumber = extractClaimNumber(
    rawText.match(/Claim number\s+([A-Z0-9]+)\s+Injury date/i)?.[1],
  );
  const injuryRaw = rawText.match(
    /Claim number\s+[A-Z0-9]+\s+Injury date\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
  )?.[1];
  const employerRaw = rawText.match(/Employer name\s+([^\n]+)/i)?.[1]?.trim().toUpperCase();
  const attendingDoctorName = rawText
    .match(/Attending doctor\s+([^\n]+)/i)?.[1]
    ?.trim()
    .toUpperCase();
  const cmMatch = rawText.match(/Claim Manager\s+([A-Z][A-Z\s.'-]+?)\s+(\d{3}-\d{3}-\d{4})/i);
  const claimManagerFax = rawText.match(/Claim Manager fax:?\s*(\d{3}-\d{3}-\d{4})/i)?.[1];
  const clientName = rawText
    .match(/patient,?\s+([A-Za-z]+(?:\s+[A-Za-z]+)+)\s*\(/i)?.[1]
    ?.trim()
    .toUpperCase();

  const clinicMatch = rawText.match(
    /\n([A-Z][A-Z\s&.'-]*(?:CLINIC|MEDICAL|HEALTH|HOSPITAL))\s*\n\s*(\d+[^\n]+?)\s*,?\s*([A-Za-z\s]+),\s*(WA|OR|ID)\s+(\d{5}(?:-\d{4})?)/i,
  );
  const clinicPhoneRaw = rawText.match(/\bP:\s*([\d().\-\s]+)/i)?.[1]?.replace(/\D/g, "");
  const attendingDoctorPhone =
    clinicPhoneRaw?.length === 10
      ? `${clinicPhoneRaw.slice(0, 3)}-${clinicPhoneRaw.slice(3, 6)}-${clinicPhoneRaw.slice(6)}`
      : undefined;

  return {
    claimNumber,
    clientName,
    dateOfInjury: parseInjuryDate(injuryRaw),
    employerName:
      employerRaw && isPlausibleEmployerName(employerRaw) ? employerRaw : undefined,
    attendingDoctorName,
    attendingDoctorAddress: clinicMatch
      ? `${clinicMatch[2]!.trim()}, ${clinicMatch[3]!.trim()}, ${clinicMatch[4]!} ${clinicMatch[5]!}`.toUpperCase()
      : undefined,
    attendingDoctorPhone,
    claimManagerName: cmMatch?.[1]?.trim().toUpperCase(),
    claimManagerPhone: cmMatch?.[2],
    claimManagerFax,
    diagnoses: parseDiagnosisCodes(rawText),
  };
}

/** Occupational health / AP visit notes with claim header fields. */
function parseOccupationalHealthNoteFields(rawText: string): Partial<ParsedLniCacFields> {
  if (!/Company of Injury:/i.test(rawText) || !/Claim No\.:/i.test(rawText)) return {};

  const claimNumber = extractClaimNumber(rawText.match(/Claim No\.:\s*([A-Z0-9]+)/i)?.[1]);
  const employerRaw = rawText.match(/Company of Injury:\s*([^\n]+)/i)?.[1]?.trim().toUpperCase();
  const nameMatch = rawText.match(/Name:\s*([A-Z]+),\s*([A-Za-z]+)\b/i);
  const clientName = nameMatch
    ? `${nameMatch[2]!.trim()} ${nameMatch[1]!.trim()}`.toUpperCase()
    : undefined;
  const injuryRaw = rawText.match(/Date of Injury:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];

  const doctorRaw =
    rawText.match(
      /([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+),\s*M\.?\s*D\.?(?:,\s*Medical Director)?/i,
    )?.[0] ??
    rawText.match(/\n([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+),\s*M\.?\s*D\.?\s*\n/i)?.[0];
  const attendingDoctorName = doctorRaw
    ? doctorRaw
        .replace(/,?\s*Medical Director.*$/i, "")
        .replace(/,?\s*M\.?\s*D\.?/i, " MD")
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase()
    : undefined;

  const clinicMatch = rawText.match(
    /\n([A-Z][A-Z\s&.'-]+(?:OCCUPATIONAL HEALTH|CLINIC|MEDICAL CENTERS?|HEALTH))\s*\n\s*(\d+[^\n]+)\s*\n\s*([A-Za-z\s]+),\s*(WA|OR|ID)\s+(\d{5}(?:-\d{4})?)\s*\n\s*([\d-]+)/i,
  );
  const phoneRaw = clinicMatch?.[6]?.replace(/\D/g, "");
  const attendingDoctorPhone =
    phoneRaw?.length === 10
      ? `${phoneRaw.slice(0, 3)}-${phoneRaw.slice(3, 6)}-${phoneRaw.slice(6)}`
      : clinicMatch?.[6];

  return {
    claimNumber,
    clientName,
    dateOfInjury: parseInjuryDate(injuryRaw),
    employerName:
      employerRaw && isPlausibleEmployerName(employerRaw) ? employerRaw : undefined,
    attendingDoctorName,
    attendingDoctorAddress: clinicMatch
      ? `${clinicMatch[2]!.trim()}, ${clinicMatch[3]!.trim()}, ${clinicMatch[4]!} ${clinicMatch[5]!}`.toUpperCase()
      : undefined,
    attendingDoctorPhone,
    diagnoses: parseDiagnosisCodes(rawText),
  };
}

export function parseLniCacText(
  rawText: string,
  options?: { requireDiagnoses?: boolean; requireMailingAddress?: boolean },
): ParsedLniCacFields {
  const lineStacked = parseLineStackedFields(rawText);
  const faxReferral = parseMedicalReferralFaxFields(rawText);
  const occHealth = parseOccupationalHealthNoteFields(rawText);
  const text = normalizeText(rawText);
  const warnings: string[] = [];

  const claimRaw =
    text.match(/Claim number\s+([A-Z0-9]+)/i)?.[1] ??
    text.match(/\bClaim\s+#?\s*([A-Z]{1,2}\d+)\b/i)?.[1];
  const claimNumber = extractClaimNumber(claimRaw);

  const injuryRaw =
    text.match(/Injury dat(?:e)?\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ??
    text.match(/Injury date\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  let dateOfInjury = parseInjuryDate(injuryRaw);
  if (!dateOfInjury) {
    const allowedStart = text.match(/\bAllowed\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
    dateOfInjury = parseInjuryDate(allowedStart);
  }
  if (!dateOfInjury) {
    const received = text.match(/Claim received at L&I\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
    dateOfInjury = parseInjuryDate(received);
  }

  const compact = parseCompactStackedFields(text);
  const stacked = pickStackedFields(lineStacked, compact);
  const afterClaim = parseAfterClaimNumberStack(text);
  const clientName =
    faxReferral.clientName ??
    occHealth.clientName ??
    stacked.clientName ??
    afterClaim.clientName ??
    parseWorkerName(text);
  const employerName =
    faxReferral.employerName ??
    occHealth.employerName ??
    stacked.employerName ??
    afterClaim.employerName ??
    parseEmployerName(text);
  const attendingParsed = parseAttendingDoctor(text);
  const attending = {
    ...attendingParsed,
    attendingDoctorName:
      faxReferral.attendingDoctorName ??
      occHealth.attendingDoctorName ??
      stacked.attendingDoctorName ??
      afterClaim.attendingDoctorName ??
      attendingParsed.attendingDoctorName,
    attendingDoctorAddress:
      faxReferral.attendingDoctorAddress ??
      occHealth.attendingDoctorAddress ??
      attendingParsed.attendingDoctorAddress,
    attendingDoctorPhone:
      faxReferral.attendingDoctorPhone ??
      occHealth.attendingDoctorPhone ??
      attendingParsed.attendingDoctorPhone,
  };
  const legalRepresentative = parseLegalRepresentative(text);
  const claimManagerInline = parseClaimManager(text);
  const claimManager = faxReferral.claimManagerName
    ? {
        claimManagerName: faxReferral.claimManagerName,
        claimManagerPhone: faxReferral.claimManagerPhone ?? claimManagerInline.claimManagerPhone,
        claimManagerFax: faxReferral.claimManagerFax ?? claimManagerInline.claimManagerFax,
      }
    : stacked.claimManagerName
      ? {
          claimManagerName: stacked.claimManagerName,
          claimManagerPhone: stacked.claimManagerPhone ?? claimManagerInline.claimManagerPhone,
          claimManagerFax: stacked.claimManagerFax ?? claimManagerInline.claimManagerFax,
        }
      : afterClaim.claimManagerName
        ? {
            claimManagerName: afterClaim.claimManagerName,
            claimManagerPhone: afterClaim.claimManagerPhone ?? claimManagerInline.claimManagerPhone,
            claimManagerFax: afterClaim.claimManagerFax ?? claimManagerInline.claimManagerFax,
          }
        : claimManagerInline;
  const addresses = parseWorkerAddresses(text, rawText);
  const vrc = parseVrcContact(text);
  const diagnoses = [
    ...new Set([
      ...parseDiagnosisCodes(text),
      ...(faxReferral.diagnoses ?? []),
      ...(occHealth.diagnoses ?? []),
    ]),
  ];

  if (options?.requireDiagnoses && !diagnoses.length) {
    warnings.push("Could not find diagnosis codes in claim status PDF");
  }
  if (!claimNumber) warnings.push("Could not find claim number in claim status PDF");
  if (options?.requireMailingAddress && !addresses.mailingAddressLine1) {
    warnings.push("Could not find worker mailing address");
  }

  return {
    claimNumber:
      claimNumber ?? faxReferral.claimNumber ?? occHealth.claimNumber ?? stacked.claimNumber ?? afterClaim.claimNumber,
    clientName,
    dateOfInjury:
      faxReferral.dateOfInjury ?? occHealth.dateOfInjury ?? stacked.dateOfInjury ?? dateOfInjury,
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
