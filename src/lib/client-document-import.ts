import mammoth from "mammoth";
import {
  classifyClientDocument,
  type ImportableDocCategory,
} from "@/lib/client-document-types";
import {
  formatMissingRequiredFields,
  getMissingRequiredImportFields,
  mergeDocumentPartsPreferValid,
} from "@/lib/client-import-quality";
import { listClientFolderFiles, downloadFileBuffer, type DriveFile } from "@/lib/google-drive";
import { ocrImageBuffer, ocrPdfBuffer } from "@/lib/google-vision-ocr";
import { parseContactAddressesDocxText } from "@/lib/parse-contact-addresses-docx";
import { parseLniAddressesText, type ParsedAddressesContacts } from "@/lib/parse-lni-addresses";
import { parseLniClaimStatusText, type ParsedClaimStatus } from "@/lib/parse-lni-claim-status";
import { parseReferralSheetText, type ParsedReferralSheet } from "@/lib/parse-referral-sheet";
import { extractPdfText } from "@/lib/pdf-text";
import type { ClientDocumentPart } from "@/lib/client-import-quality";

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

function fromContactAddressesDocx(
  parsed: ReturnType<typeof parseContactAddressesDocxText>,
): LniSupplementFields {
  return {
    clientName: parsed.clientName,
    employerName: parsed.employerName,
    attendingDoctorName: parsed.attendingDoctorName,
    claimManagerName: parsed.claimManagerName,
    claimManagerPhone: parsed.claimManagerPhone,
    claimManagerFax: parsed.claimManagerFax,
    addressLine1: parsed.mailingAddressLine1,
    city: parsed.mailingCity,
    state: parsed.mailingState,
    zip: parsed.mailingZip,
    residenceAddressLine1: parsed.residenceAddressLine1,
    residenceCity: parsed.residenceCity,
    residenceState: parsed.residenceState,
    residenceZip: parsed.residenceZip,
  };
}

function isContactAddressesDocx(text: string, filename: string): boolean {
  return /Claimant:/i.test(text) || /Contact\s*&?\s*Addresses/i.test(filename);
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

/** Run both L&I parsers and merge — catches fields split across claim/address views. */
function parseWithAllLniParsers(text: string, filename: string): ClientDocumentSupplement {
  const merged: ClientDocumentSupplement = { diagnoses: [], warnings: [] };
  applyClaimStatus(merged, parseLniClaimStatusText(text), `${filename} (claim retry)`);
  applyAddresses(merged, parseLniAddressesText(text), `${filename} (address retry)`);
  return merged;
}

function isPdfFile(file: DriveFile): boolean {
  return (
    file.mimeType === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function isImageFile(file: DriveFile): boolean {
  return (
    /^image\//.test(file.mimeType) ||
    /\.(png|jpe?g|webp|gif)$/i.test(file.name)
  );
}

function isWordCategory(category: ImportableDocCategory): boolean {
  return category === "word-doc-cac-address" || category === "referral-sheet";
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
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      if (value.trim()) return value;
    } catch {
      // Fall through to legacy .doc extractor.
    }
  }

  const WordExtractor = (await import("word-extractor")).default;
  const doc = await new WordExtractor().extract(buffer);
  const body = doc.getBody().trim();
  if (body.length > 1) return body;

  throw new Error(
    "Legacy Word (.doc) file contains no extractable text. Re-save as .docx or PDF.",
  );
}

async function extractFileText(
  buffer: Buffer,
  file: DriveFile,
  category: ImportableDocCategory,
  options?: { forceOcr?: boolean },
): Promise<{ text: string; usedOcr: boolean; warnings: string[] }> {
  if (isWordCategory(category)) {
    const text = await extractWordText(buffer, file.mimeType, file.name);
    return { text, usedOcr: false, warnings: [] };
  }

  if (isImageFile(file)) {
    try {
      const ocrText = await ocrImageBuffer(buffer);
      if (ocrText.trim()) {
        return { text: ocrText, usedOcr: true, warnings: [`${file.name}: image OCR`] };
      }
      return { text: "", usedOcr: true, warnings: [`${file.name}: image OCR returned no text`] };
    } catch (e) {
      return {
        text: "",
        usedOcr: true,
        warnings: [
          `${file.name}: image OCR failed (${e instanceof Error ? e.message : "unknown error"})`,
        ],
      };
    }
  }

  if (options?.forceOcr && isPdfFile(file)) {
    try {
      const ocrText = await ocrPdfBuffer(buffer);
      if (ocrText.trim()) {
        return { text: ocrText, usedOcr: true, warnings: [`${file.name}: OCR retry`] };
      }
      return { text: "", usedOcr: true, warnings: [`${file.name}: OCR retry returned no text`] };
    } catch (e) {
      return {
        text: "",
        usedOcr: true,
        warnings: [
          `${file.name}: OCR retry failed (${e instanceof Error ? e.message : "unknown error"})`,
        ],
      };
    }
  }

  const { text, usedOcr, parseError, ocrError } = await extractPdfText(buffer);
  if (!text.trim()) {
    const details = [
      usedOcr ? "OCR attempted" : null,
      ocrError ? `OCR: ${ocrError.slice(0, 120)}` : null,
      parseError ? `PDF: ${parseError.slice(0, 120)}` : null,
    ].filter(Boolean);
    return {
      text: "",
      usedOcr,
      warnings: [
        `${file.name}: no text extracted${details.length ? ` (${details.join("; ")})` : ""}`,
      ],
    };
  }

  const warnings = usedOcr ? [`${file.name}: used OCR`] : [];
  return { text, usedOcr, warnings };
}

function supplementFromText(
  text: string,
  category: ImportableDocCategory,
  filename: string,
  mode: "routed" | "all-parsers",
): ClientDocumentSupplement {
  if (category === "referral-sheet") {
    const parsed: ClientDocumentSupplement = { diagnoses: [], warnings: [] };
    applyLniFields(parsed, fromReferralSheet(parseReferralSheetText(text)));
    return parsed;
  }
  if (isContactAddressesDocx(text, filename)) {
    const parsed: ClientDocumentSupplement = { diagnoses: [], warnings: [] };
    applyLniFields(parsed, fromContactAddressesDocx(parseContactAddressesDocxText(text)));
    applyAddresses(parsed, parseLniAddressesText(text), `${filename} (lni)`);
    return parsed;
  }
  if (mode === "all-parsers") {
    return parseWithAllLniParsers(text, filename);
  }
  return routeTextToParser(text, category, filename);
}

async function parseImportableFile(
  accessToken: string,
  file: DriveFile,
  category: ImportableDocCategory,
  options?: { forceOcr?: boolean; parseMode?: "routed" | "all-parsers" },
): Promise<ClientDocumentSupplement> {
  const buffer = await downloadFileBuffer(accessToken, file);
  const { text, warnings: extractWarnings } = await extractFileText(
    buffer,
    file,
    category,
    options,
  );

  if (!text.trim()) {
    return { diagnoses: [], warnings: extractWarnings };
  }

  const parsed = supplementFromText(
    text,
    category,
    file.name,
    options?.parseMode ?? "routed",
  );
  parsed.warnings.push(...extractWarnings);
  return parsed;
}

async function retryMissingRequiredFields(
  accessToken: string,
  importable: { file: DriveFile; category: ImportableDocCategory }[],
  parts: ClientDocumentPart[],
): Promise<ClientDocumentPart[]> {
  let merged = mergeDocumentPartsPreferValid(parts);
  let missing = getMissingRequiredImportFields(undefined, merged);
  if (!missing.length) return parts;

  const retried = [...parts];

  // Retry 1: run both L&I parsers on every document.
  for (const { file, category } of importable) {
    if (category === "referral-sheet") continue;
    try {
      const supplement = await parseImportableFile(accessToken, file, category, {
        parseMode: "all-parsers",
      });
      retried.push({ filename: `${file.name} (dual-parser retry)`, supplement });
    } catch (e) {
      retried.push({
        filename: `${file.name} (dual-parser retry)`,
        supplement: {
          diagnoses: [],
          warnings: [
            `${file.name}: dual-parser retry failed (${e instanceof Error ? e.message : "error"})`,
          ],
        },
      });
    }
  }

  merged = mergeDocumentPartsPreferValid(retried);
  missing = getMissingRequiredImportFields(undefined, merged);
  if (!missing.length) return retried;

  // Retry 2: force fresh OCR on PDFs, then dual-parse.
  for (const { file, category } of importable) {
    if (category === "referral-sheet" || !isPdfFile(file)) continue;
    try {
      const supplement = await parseImportableFile(accessToken, file, category, {
        forceOcr: true,
        parseMode: "all-parsers",
      });
      retried.push({ filename: `${file.name} (OCR retry)`, supplement });
    } catch (e) {
      retried.push({
        filename: `${file.name} (OCR retry)`,
        supplement: {
          diagnoses: [],
          warnings: [
            `${file.name}: OCR retry failed (${e instanceof Error ? e.message : "error"})`,
          ],
        },
      });
    }
  }

  return retried;
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
  const { merged } = await importClientDocumentsFromFolderDetailed(accessToken, clientFolderId);
  return merged;
}

export async function importClientDocumentsFromFolderDetailed(
  accessToken: string,
  clientFolderId: string,
): Promise<{ merged: ClientDocumentSupplement; parts: ClientDocumentPart[] }> {
  const files = await listClientFolderFiles(accessToken, clientFolderId);
  const importable = files
    .map((f) => ({ file: f, category: classifyClientDocument(f.name, f.mimeType) }))
    .filter((x): x is { file: DriveFile; category: ImportableDocCategory } => x.category !== null);

  const parts: ClientDocumentPart[] = [];
  for (const { file, category } of importable) {
    try {
      const supplement = await parseImportableFile(accessToken, file, category);
      parts.push({ filename: file.name, supplement });
    } catch (e) {
      parts.push({
        filename: file.name,
        supplement: {
          diagnoses: [],
          warnings: [
            `${file.name}: ${e instanceof Error ? e.message : "Could not parse file."}`,
          ],
        },
      });
    }
  }

  const retriedParts = await retryMissingRequiredFields(accessToken, importable, parts);
  const merged = mergeDocumentPartsPreferValid(retriedParts);
  const stillMissing = getMissingRequiredImportFields(undefined, merged);
  if (stillMissing.length) {
    merged.warnings.push(
      `Missing required fields after retries: ${formatMissingRequiredFields(stillMissing)}`,
    );
  }

  return { merged, parts: retriedParts };
}

export type UploadedReferralFile = {
  fieldName: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
};

function categoryForReferralUpload(
  fieldName: string,
  filename: string,
  mimeType: string,
): ImportableDocCategory {
  if (fieldName === "claimStatusFile") return "claim-account-center";
  if (fieldName === "addressesFile") return "addresses-contacts";
  return classifyClientDocument(filename, mimeType) ?? "addresses-contacts";
}

export async function parseUploadedReferralDocuments(
  files: UploadedReferralFile[],
): Promise<{ merged: ClientDocumentSupplement; parts: ClientDocumentPart[] }> {
  const parts: ClientDocumentPart[] = [];

  for (const file of files) {
    const category = categoryForReferralUpload(file.fieldName, file.filename, file.mimeType);
    const driveFile: DriveFile = {
      id: "",
      name: file.filename,
      mimeType: file.mimeType,
    };

    try {
      const { text, warnings: extractWarnings } = await extractFileText(
        file.buffer,
        driveFile,
        category,
        { forceOcr: true },
      );
      let supplement: ClientDocumentSupplement;
      if (!text.trim()) {
        supplement = { diagnoses: [], warnings: extractWarnings };
      } else {
        supplement = supplementFromText(text, category, file.filename, "all-parsers");
        supplement.warnings.push(...extractWarnings);
      }
      parts.push({ filename: file.filename, supplement });
    } catch (e) {
      parts.push({
        filename: file.filename,
        supplement: {
          diagnoses: [],
          warnings: [
            `${file.filename}: ${e instanceof Error ? e.message : "Could not parse file."}`,
          ],
        },
      });
    }
  }

  return { merged: mergeDocumentPartsPreferValid(parts), parts };
}
