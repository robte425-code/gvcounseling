import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

const textFields = [
  "vrcName",
  "vrcEmail",
  "contactMethod",
  "vrcPhone",
  "clientName",
  "claimNumbers",
  "clientDob",
  "clientEmail",
  "pgapCoach",
  "languages",
  "genderIdentity",
  "priorServices",
  "clientHistory",
] as const;

const fileFields = [
  "claimStatusFile",
  "addressesFile",
  "bhiApprovalFile",
  "attachment1",
  "attachment2",
  "attachment3",
  "attachment4",
] as const;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const vrcName = formData.get("vrcName");
    const clientName = formData.get("clientName");

    if (!vrcName || !clientName) {
      return NextResponse.json({ error: "Required fields are missing." }, { status: 400 });
    }

    const lines: string[] = ["New client referral submission", ""];

    for (const field of textFields) {
      const value = formData.get(field);
      if (value && typeof value === "string" && value.trim()) {
        lines.push(`${field}: ${value}`);
      }
    }

    const attachments: { filename: string; content: string; contentType?: string }[] = [];

    for (const field of fileFields) {
      const file = formData.get(field);
      if (file instanceof File && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        attachments.push({
          filename: file.name,
          content: buffer.toString("base64"),
          contentType: file.type || undefined,
        });
        lines.push(`${field}: ${file.name} (${Math.round(file.size / 1024)} KB)`);
      }
    }

    await sendEmail({
      subject: `Client referral: ${clientName}`,
      replyTo: String(formData.get("vrcEmail") || ""),
      text: lines.join("\n"),
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Referral form error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit referral." },
      { status: 500 },
    );
  }
}
