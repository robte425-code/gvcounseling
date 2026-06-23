/** Google Cloud Vision document text detection for scanned PDF pages. */

export async function ocrImageBuffer(image: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GOOGLE_CLOUD_VISION_API_KEY is not set. Enable Cloud Vision API in your Google Cloud project.",
    );
  }

  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
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
