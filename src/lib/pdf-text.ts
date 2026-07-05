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

async function tryPdfJsExtract(
  buffer: Buffer,
  sortByPosition = false,
): Promise<{ text: string; pages: number; error?: string }> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs
      .getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })
      .promise;

    const parts: string[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      let pageText: string;
      if (sortByPosition) {
        const items = content.items.flatMap((item) => {
          if (!("str" in item) || typeof item.str !== "string") return [];
          const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : null;
          if (!transform) return [{ str: item.str, y: 0, x: 0 }];
          return [{ str: item.str, y: transform[5] ?? 0, x: transform[4] ?? 0 }];
        });
        items.sort((a, b) => {
          const yDiff = b.y - a.y;
          if (Math.abs(yDiff) > 4) return yDiff;
          return a.x - b.x;
        });
        pageText = items.map((item) => item.str).join(" ");
      } else {
        pageText = content.items
          .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
          .join(" ");
      }
      parts.push(pageText);
    }

    const pages = doc.numPages;
    await doc.destroy();
    return { text: parts.join("\n"), pages };
  } catch (e) {
    return {
      text: "",
      pages: 0,
      error: e instanceof Error ? e.message : "PDF text extraction failed",
    };
  }
}

async function extractWithPdfJs(
  buffer: Buffer,
): Promise<{ text: string; pages: number; error?: string }> {
  const unsorted = await tryPdfJsExtract(buffer, false);
  if (isTextExtractable(unsorted.text, unsorted.pages)) return unsorted;

  const sorted = await tryPdfJsExtract(buffer, true);
  if (isTextExtractable(sorted.text, sorted.pages)) return sorted;

  return unsorted.text.length >= sorted.text.length ? unsorted : sorted;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (!isPdfBuffer(buffer)) {
    return { text: "", pages: 0, usedOcr: false, parseError: "Not a PDF file" };
  }

  const parsed = await extractWithPdfJs(buffer);

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

/** Remittance advice PDFs are multi-page; OCR more pages and prefer pdf.js stream order. */
export async function extractRemittancePdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (!isPdfBuffer(buffer)) {
    return { text: "", pages: 0, usedOcr: false, parseError: "Not a PDF file" };
  }

  const parsed = await extractWithPdfJs(buffer);

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
