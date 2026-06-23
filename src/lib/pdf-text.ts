import { isTextExtractable } from "@/lib/client-document-types";
import { ocrPdfBuffer } from "@/lib/google-vision-ocr";

const MAX_OCR_PAGES = 3;

export type PdfExtractResult = {
  text: string;
  pages: number;
  usedOcr: boolean;
};

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString() === "%PDF";
}

async function tryPdfParse(buffer: Buffer): Promise<{ text: string; pages: number }> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text ?? "", pages: result.total ?? result.pages?.length ?? 0 };
  } catch {
    return { text: "", pages: 0 };
  }
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (!isPdfBuffer(buffer)) {
    return { text: "", pages: 0, usedOcr: false };
  }

  const parsed = await tryPdfParse(buffer);

  if (isTextExtractable(parsed.text, parsed.pages)) {
    return { text: parsed.text, pages: parsed.pages, usedOcr: false };
  }

  try {
    const ocrText = await ocrPdfBuffer(buffer, MAX_OCR_PAGES);
    if (ocrText.trim()) {
      return { text: ocrText, pages: parsed.pages, usedOcr: true };
    }
  } catch {
    // Fall through to whatever pdf-parse returned.
  }

  return { text: parsed.text, pages: parsed.pages, usedOcr: false };
}
