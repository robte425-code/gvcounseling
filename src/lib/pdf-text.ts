import { isTextExtractable } from "@/lib/client-document-types";
import { ocrPdfBuffer } from "@/lib/google-vision-ocr";

const MAX_OCR_PAGES = 3;

export type PdfExtractResult = {
  text: string;
  pages: number;
  usedOcr: boolean;
  parseError?: string;
  ocrError?: string;
};

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString() === "%PDF";
}

async function tryUnpdfExtract(
  buffer: Buffer,
): Promise<{ text: string; pages: number; error?: string }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pageTexts = Array.isArray(text) ? text : [text];
    return {
      text: pageTexts.join("\n"),
      pages: totalPages,
    };
  } catch (e) {
    return {
      text: "",
      pages: 0,
      error: e instanceof Error ? e.message : "PDF text extraction failed",
    };
  }
}

async function extractWithPdfParser(
  buffer: Buffer,
): Promise<{ text: string; pages: number; error?: string }> {
  return tryUnpdfExtract(buffer);
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (!isPdfBuffer(buffer)) {
    return { text: "", pages: 0, usedOcr: false, parseError: "Not a PDF file" };
  }

  const parsed = await extractWithPdfParser(buffer);

  if (isTextExtractable(parsed.text, parsed.pages)) {
    return { text: parsed.text, pages: parsed.pages, usedOcr: false };
  }

  let ocrError: string | undefined;
  try {
    const ocrText = await ocrPdfBuffer(buffer, MAX_OCR_PAGES);
    if (ocrText.trim()) {
      return { text: ocrText, pages: parsed.pages, usedOcr: true };
    }
    ocrError = "OCR returned no text";
  } catch (e) {
    ocrError = e instanceof Error ? e.message : "OCR failed";
  }

  return {
    text: parsed.text,
    pages: parsed.pages,
    usedOcr: false,
    parseError: parsed.error,
    ocrError,
  };
}

const MAX_REMITTANCE_OCR_PAGES = 10;

/** Remittance advice PDFs are multi-page; OCR more pages when text extraction is sparse. */
export async function extractRemittancePdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (!isPdfBuffer(buffer)) {
    return { text: "", pages: 0, usedOcr: false, parseError: "Not a PDF file" };
  }

  const parsed = await extractWithPdfParser(buffer);

  if (isTextExtractable(parsed.text, parsed.pages)) {
    return { text: parsed.text, pages: parsed.pages, usedOcr: false };
  }

  let ocrError: string | undefined;
  try {
    const ocrText = await ocrPdfBuffer(buffer, MAX_REMITTANCE_OCR_PAGES);
    if (ocrText.trim()) {
      return { text: ocrText, pages: parsed.pages, usedOcr: true };
    }
    ocrError = "OCR returned no text";
  } catch (e) {
    ocrError = e instanceof Error ? e.message : "OCR failed";
  }

  return {
    text: parsed.text,
    pages: parsed.pages,
    usedOcr: false,
    parseError: parsed.error,
    ocrError,
  };
}
