import { isTextExtractable } from "@/lib/client-document-types";
import { ocrImageBuffer } from "@/lib/google-vision-ocr";

const MAX_OCR_PAGES = 3;

export type PdfExtractResult = {
  text: string;
  pages: number;
  usedOcr: boolean;
};

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

async function ocrPdfPages(buffer: Buffer, maxPages: number): Promise<string> {
  const { pdf } = await import("pdf-to-img");
  const parts: string[] = [];
  let pageNum = 0;
  const document = await pdf(buffer, { scale: 2 });

  for await (const page of document) {
    pageNum++;
    if (pageNum > maxPages) break;
    const text = await ocrImageBuffer(Buffer.from(page));
    if (text) parts.push(text);
  }

  return parts.join("\n\n");
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const parsed = await tryPdfParse(buffer);

  if (isTextExtractable(parsed.text, parsed.pages)) {
    return { text: parsed.text, pages: parsed.pages, usedOcr: false };
  }

  const ocrText = await ocrPdfPages(buffer, MAX_OCR_PAGES);
  if (ocrText.trim()) {
    return { text: ocrText, pages: parsed.pages, usedOcr: true };
  }

  return { text: parsed.text, pages: parsed.pages, usedOcr: false };
}
