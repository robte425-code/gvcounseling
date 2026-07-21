import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { validateEdi999 } from "@/lib/parse-edi-999";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Select a 999 acknowledgement file." }, { status: 400 });
    }

    const content = await file.text();
    if (!content.trim()) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }

    try {
      const result = validateEdi999(content);
      return NextResponse.json({
        filename: file.name,
        result,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Could not parse 999 file.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("validate-999 failed:", error);
    return NextResponse.json({ error: "Could not validate 999 file." }, { status: 500 });
  }
}
