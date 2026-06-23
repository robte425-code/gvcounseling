import mammoth from "mammoth";
import {
  classifyClientDocument,
  type ImportableDocCategory,
} from "@/lib/client-document-types";
import { listClientFolderFiles, downloadFileBuffer, type DriveFile } from "@/lib/google-drive";
import { parseLniAddressesText, type ParsedAddressesContacts } from "@/lib/parse-lni-addresses";
import { parseLniClaimStatusText, type ParsedClaimStatus } from "@/lib/parse-lni-claim-status";
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
  vrcName?: string;
  vrcPhone?: string;
  warnings: string[];
};

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

function applyClaimStatus(into: ClientDocumentSupplement, parsed: ParsedClaimStatus, source: string) {
  into.claimNumber ??= parsed.claimNumber;
  into.clientName ??= parsed.clientName;
  into.dateOfInjury ??= parsed.dateOfInjury;
  mergeDiagnoses(into.diagnoses, parsed.diagnoses);
  for (const w of parsed.warnings) into.warnings.push(`${source}: ${w}`);
}

function applyAddresses(into: ClientDocumentSupplement, parsed: ParsedAddressesContacts, source: string) {
  into.claimNumber ??= parsed.claimNumber;
  into.clientName ??= parsed.clientName;
  into.dateOfInjury ??= parsed.dateOfInjury;
  into.addressLine1 ??= parsed.addressLine1;
  into.city ??= parsed.city;
  into.state ??= parsed.state;
  into.zip ??= parsed.zip;
  into.vrcName ??= parsed.vrcName;
  into.vrcPhone ??= parsed.vrcPhone;
  for (const w of parsed.warnings) into.warnings.push(`${source}: ${w}`);
}

function routeTextToParser(
  text: string,
  category: ImportableDocCategory,
  filename: string,
): ClientDocumentSupplement {
  const empty: ClientDocumentSupplement = { diagnoses: [], warnings: [] };

  if (category === "addresses-contacts" || /addresses?\s*&?\s*contacts?/i.test(text)) {
    applyAddresses(empty, parseLniAddressesText(text), filename);
    return empty;
  }

  if (
    category === "claim-account-center" ||
    category === "claim-number-pdf" ||
    /current claim status/i.test(text)
  ) {
    applyClaimStatus(empty, parseLniClaimStatusText(text), filename);
    return empty;
  }

  if (category === "word-doc-cac-address") {
    if (/addresses?\s*&?\s*contacts?/i.test(text)) {
      applyAddresses(empty, parseLniAddressesText(text), filename);
    } else {
      applyClaimStatus(empty, parseLniClaimStatusText(text), filename);
    }
    return empty;
  }

  empty.warnings.push(`${filename}: unrecognized document content`);
  return empty;
}

async function extractWordText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

async function parseImportableFile(
  accessToken: string,
  file: DriveFile,
  category: ImportableDocCategory,
): Promise<ClientDocumentSupplement> {
  const buffer = await downloadFileBuffer(accessToken, file);

  if (category === "word-doc-cac-address") {
    const text = await extractWordText(buffer);
    return routeTextToParser(text, category, file.name);
  }

  const { text, usedOcr } = await extractPdfText(buffer);
  if (!text.trim()) {
    return {
      diagnoses: [],
      warnings: [`${file.name}: no text extracted${usedOcr ? " (OCR attempted)" : ""}`],
    };
  }

  const parsed = routeTextToParser(text, category, file.name);
  if (usedOcr) parsed.warnings.push(`${file.name}: used OCR`);
  return parsed;
}

function mergeSupplements(parts: ClientDocumentSupplement[]): ClientDocumentSupplement {
  const merged: ClientDocumentSupplement = { diagnoses: [], warnings: [] };
  for (const part of parts) {
    merged.claimNumber ??= part.claimNumber;
    merged.clientName ??= part.clientName;
    merged.dateOfInjury ??= part.dateOfInjury;
    merged.addressLine1 ??= part.addressLine1;
    merged.city ??= part.city;
    merged.state ??= part.state;
    merged.zip ??= part.zip;
    merged.vrcName ??= part.vrcName;
    merged.vrcPhone ??= part.vrcPhone;
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
