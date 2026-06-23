import mammoth from "mammoth";
import {
  classifyClientDocument,
  type ImportableDocCategory,
} from "@/lib/client-document-types";
import { listClientFolderFiles, downloadFileBuffer, type DriveFile } from "@/lib/google-drive";
import { parseLniAddressesText, type ParsedAddressesContacts } from "@/lib/parse-lni-addresses";
import { parseLniClaimStatusText, type ParsedClaimStatus } from "@/lib/parse-lni-claim-status";
import { parseReferralSheetText, type ParsedReferralSheet } from "@/lib/parse-referral-sheet";
import { extractPdfText } from "@/lib/pdf-text";

export type ClientDocumentSupplement = {
  claimNumber?: string;
  clientName?: string;
  dateOfInjury?: Date;
  diagnoses: string[];
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
  residenceAddressLine1?: string;
  residenceCity?: string;
  residenceState?: string;
  residenceZip?: string;
  workerPhone?: string;
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
  vrcName?: string;
  vrcPhone?: string;
  warnings: string[];
};

type LniSupplementFields = Omit<ClientDocumentSupplement, "diagnoses" | "warnings">;

function mergeDiagnoses(into: string[], from: string[]) {
  const seen = new Set(into.map((c) => c.toUpperCase()));
  for (const code of from) {
    const upper = code.toUpperCase();
    if (!seen.has(upper)) {
      seen.add(upper);
      into.push(upper);
    }
  }
}

function applyLniFields(into: LniSupplementFields, parsed: LniSupplementFields) {
  into.claimNumber ??= parsed.claimNumber;
  into.clientName ??= parsed.clientName;
  into.dateOfInjury ??= parsed.dateOfInjury;
  into.addressLine1 ??= parsed.addressLine1;
  into.city ??= parsed.city;
  into.state ??= parsed.state;
  into.zip ??= parsed.zip;
  into.residenceAddressLine1 ??= parsed.residenceAddressLine1;
  into.residenceCity ??= parsed.residenceCity;
  into.residenceState ??= parsed.residenceState;
  into.residenceZip ??= parsed.residenceZip;
  into.workerPhone ??= parsed.workerPhone;
  into.employerName ??= parsed.employerName;
  into.attendingDoctorName ??= parsed.attendingDoctorName;
  into.attendingDoctorAddress ??= parsed.attendingDoctorAddress;
  into.attendingDoctorPhone ??= parsed.attendingDoctorPhone;
  into.claimManagerName ??= parsed.claimManagerName;
  into.claimManagerPhone ??= parsed.claimManagerPhone;
  into.claimManagerFax ??= parsed.claimManagerFax;
  into.legalRepresentativeName ??= parsed.legalRepresentativeName;
  into.legalRepresentativeAddress ??= parsed.legalRepresentativeAddress;
  into.legalRepresentativePhone ??= parsed.legalRepresentativePhone;
  into.vrcName ??= parsed.vrcName;
  into.vrcPhone ??= parsed.vrcPhone;
}

function fromClaimStatus(parsed: ParsedClaimStatus): LniSupplementFields {
  return {
    claimNumber: parsed.claimNumber,
    clientName: parsed.clientName,
    dateOfInjury: parsed.dateOfInjury,
    employerName: parsed.employerName,
    attendingDoctorName: parsed.attendingDoctorName,
    attendingDoctorAddress: parsed.attendingDoctorAddress,
    attendingDoctorPhone: parsed.attendingDoctorPhone,
    claimManagerName: parsed.claimManagerName,
    claimManagerPhone: parsed.claimManagerPhone,
    claimManagerFax: parsed.claimManagerFax,
    legalRepresentativeName: parsed.legalRepresentativeName,
    legalRepresentativeAddress: parsed.legalRepresentativeAddress,
    legalRepresentativePhone: parsed.legalRepresentativePhone,
  };
}

function fromAddresses(parsed: ParsedAddressesContacts): LniSupplementFields {
  return {
    claimNumber: parsed.claimNumber,
    clientName: parsed.clientName,
    dateOfInjury: parsed.dateOfInjury,
    addressLine1: parsed.mailingAddressLine1,
    city: parsed.mailingCity,
    state: parsed.mailingState,
    zip: parsed.mailingZip,
    residenceAddressLine1: parsed.residenceAddressLine1,
    residenceCity: parsed.residenceCity,
    residenceState: parsed.residenceState,
    residenceZip: parsed.residenceZip,
    workerPhone: parsed.workerPhone,
    employerName: parsed.employerName,
    attendingDoctorName: parsed.attendingDoctorName,
    attendingDoctorAddress: parsed.attendingDoctorAddress,
    attendingDoctorPhone: parsed.attendingDoctorPhone,
    claimManagerName: parsed.claimManagerName,
    claimManagerPhone: parsed.claimManagerPhone,
    claimManagerFax: parsed.claimManagerFax,
    legalRepresentativeName: parsed.legalRepresentativeName,
    legalRepresentativeAddress: parsed.legalRepresentativeAddress,
    legalRepresentativePhone: parsed.legalRepresentativePhone,
    vrcName: parsed.vrcName,
    vrcPhone: parsed.vrcPhone,
  };
}

function fromReferralSheet(parsed: ParsedReferralSheet): LniSupplementFields {
  const fields: LniSupplementFields = {
    claimNumber: parsed.claimNumber,
    clientName: parsed.clientName,
    dateOfInjury: parsed.dateOfInjury,
    addressLine1: parsed.addressLine1,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    workerPhone: parsed.workerPhone,
    employerName: parsed.employerName,
    attendingDoctorName: parsed.attendingDoctorName,
    attendingDoctorAddress: parsed.attendingDoctorAddress,
    attendingDoctorPhone: parsed.attendingDoctorPhone,
    vrcName: parsed.vrcName,
  };
  if (parsed.addressLine1) {
    fields.residenceAddressLine1 = parsed.addressLine1;
    fields.residenceCity = parsed.city;
    fields.residenceState = parsed.state;
    fields.residenceZip = parsed.zip;
  }
  return fields;
}

function applyClaimStatus(into: ClientDocumentSupplement, parsed: ParsedClaimStatus, source: string) {
  applyLniFields(into, fromClaimStatus(parsed));
  mergeDiagnoses(into.diagnoses, parsed.diagnoses);
  for (const w of parsed.warnings) into.warnings.push(`${source}: ${w}`);
}

function applyAddresses(into: ClientDocumentSupplement, parsed: ParsedAddressesContacts, source: string) {
  applyLniFields(into, fromAddresses(parsed));
  for (const w of parsed.warnings) into.warnings.push(`${source}: ${w}`);
}

function isAddressesSource(
  category: ImportableDocCategory,
  filename: string,
  text: string,
): boolean {
  if (category === "addresses-contacts") return true;
  if (category === "claim-account-center" || category === "claim-number-pdf") return false;
  if (/address|contact/i.test(filename)) return true;
  return /addresses?\s*&?\s*contacts?/i.test(text);
}

function isClaimStatusSource(
  category: ImportableDocCategory,
  filename: string,
  text: string,
): boolean {
  if (category === "claim-account-center" || category === "claim-number-pdf") return true;
  if (category === "addresses-contacts") return false;
  if (/claim|status|\bcac\b|account center/i.test(filename)) return true;
  return /current claim status/i.test(text);
}

function routeTextToParser(
  text: string,
  category: ImportableDocCategory,
  filename: string,
): ClientDocumentSupplement {
  const empty: ClientDocumentSupplement = { diagnoses: [], warnings: [] };
  const addressDoc = isAddressesSource(category, filename, text);
  const claimDoc = isClaimStatusSource(category, filename, text);

  if (addressDoc && !claimDoc) {
    applyAddresses(empty, parseLniAddressesText(text), filename);
    return empty;
  }

  if (claimDoc && !addressDoc) {
    applyClaimStatus(empty, parseLniClaimStatusText(text), filename);
    return empty;
  }

  if (addressDoc) {
    applyAddresses(empty, parseLniAddressesText(text), filename);
    return empty;
  }

  if (claimDoc) {
    applyClaimStatus(empty, parseLniClaimStatusText(text), filename);
    return empty;
  }

  empty.warnings.push(`${filename}: unrecognized document content`);
  return empty;
}

function isDocxBuffer(buffer: Buffer, mimeType?: string, filename?: string): boolean {
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return true;
  }
  if (mimeType === "application/vnd.google-apps.document") return true;
  return /\.docx$/i.test(filename ?? "");
}

async function extractWordText(
  buffer: Buffer,
  mimeType?: string,
  filename?: string,
): Promise<string> {
  if (isDocxBuffer(buffer, mimeType, filename)) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  const WordExtractor = (await import("word-extractor")).default;
  const doc = await new WordExtractor().extract(buffer);
  const body = doc.getBody().trim();
  if (body.length > 1) return body;

  throw new Error(
    "Legacy Word (.doc) file contains no extractable text. Re-save as .docx or PDF.",
  );
}

async function parseImportableFile(
  accessToken: string,
  file: DriveFile,
  category: ImportableDocCategory,
): Promise<ClientDocumentSupplement> {
  const buffer = await downloadFileBuffer(accessToken, file);

  if (category === "word-doc-cac-address" || category === "referral-sheet") {
    const text = await extractWordText(buffer, file.mimeType, file.name);
    if (category === "referral-sheet") {
      const parsed: ClientDocumentSupplement = { diagnoses: [], warnings: [] };
      applyLniFields(parsed, fromReferralSheet(parseReferralSheetText(text)));
      return parsed;
    }
    return routeTextToParser(text, category, file.name);
  }

  const { text, usedOcr, parseError, ocrError } = await extractPdfText(buffer);
  if (!text.trim()) {
    const details = [
      usedOcr ? "OCR attempted" : null,
      ocrError ? `OCR: ${ocrError.slice(0, 120)}` : null,
      parseError ? `PDF: ${parseError.slice(0, 120)}` : null,
    ].filter(Boolean);
    return {
      diagnoses: [],
      warnings: [
        `${file.name}: no text extracted${details.length ? ` (${details.join("; ")})` : ""}`,
      ],
    };
  }

  const parsed = routeTextToParser(text, category, file.name);
  if (usedOcr) parsed.warnings.push(`${file.name}: used OCR`);
  return parsed;
}

function mergeSupplements(parts: ClientDocumentSupplement[]): ClientDocumentSupplement {
  const merged: ClientDocumentSupplement = { diagnoses: [], warnings: [] };
  for (const part of parts) {
    applyLniFields(merged, part);
    mergeDiagnoses(merged.diagnoses, part.diagnoses);
    merged.warnings.push(...part.warnings);
  }
  return merged;
}

export async function importClientDocumentsFromFolder(
  accessToken: string,
  clientFolderId: string,
): Promise<ClientDocumentSupplement> {
  const files = await listClientFolderFiles(accessToken, clientFolderId);
  const importable = files
    .map((f) => ({ file: f, category: classifyClientDocument(f.name, f.mimeType) }))
    .filter((x): x is { file: DriveFile; category: ImportableDocCategory } => x.category !== null);

  const parts: ClientDocumentSupplement[] = [];
  for (const { file, category } of importable) {
    try {
      parts.push(await parseImportableFile(accessToken, file, category));
    } catch (e) {
      parts.push({
        diagnoses: [],
        warnings: [
          `${file.name}: ${e instanceof Error ? e.message : "Could not parse file."}`,
        ],
      });
    }
  }

  return mergeSupplements(parts);
}
