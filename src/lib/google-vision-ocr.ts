/** Google Cloud Vision document text detection. */

function visionApiKey(): string {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GOOGLE_CLOUD_VISION_API_KEY is not set. Enable Cloud Vision API in your Google Cloud project.",
    );
  }
  return apiKey;
}

export async function ocrImageBuffer(image: Buffer): Promise<string> {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: image.toString("base64") },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vision API error (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[];
  };
  const response = data.responses?.[0];
  if (response?.error?.message) {
    throw new Error(`Vision API error: ${response.error.message}`);
  }
  return response?.fullTextAnnotation?.text?.trim() ?? "";
}

/** OCR a PDF directly via Vision (no browser canvas — works on Vercel). */
export async function ocrPdfBuffer(buffer: Buffer, maxPages = 3): Promise<string> {
  const res = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${visionApiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          inputConfig: {
            content: buffer.toString("base64"),
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          pages: Array.from({ length: maxPages }, (_, i) => i + 1),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vision API error (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    responses?: {
      error?: { message?: string };
      responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[];
    }[];
  };

  const fileResponse = data.responses?.[0];
  if (fileResponse?.error?.message) {
    throw new Error(`Vision API error: ${fileResponse.error.message}`);
  }

  const parts: string[] = [];
  for (const page of fileResponse?.responses ?? []) {
    if (page.error?.message) continue;
    const text = page.fullTextAnnotation?.text?.trim();
    if (text) parts.push(text);
  }

  return parts.join("\n\n");
}
