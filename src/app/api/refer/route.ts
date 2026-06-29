import { NextRequest, NextResponse } from "next/server";
import { collectReferralUploads, processReferralIntake } from "@/lib/referral-intake";
import {
  sendReferralIntakeAdminNotice,
  sendReferralIntakeFailedNotice,
} from "@/lib/referral-emails";

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
    const uploads = await collectReferralUploads(formData);

    for (const upload of uploads) {
      attachments.push({
        filename: upload.filename,
        content: upload.buffer.toString("base64"),
        contentType: upload.mimeType || undefined,
      });
      lines.push(`${upload.fieldName}: ${upload.filename} (${Math.round(upload.buffer.length / 1024)} KB)`);
    }

    const formDetails = lines.join("\n");
    const replyTo = String(formData.get("vrcEmail") || "");

    let intakeWarnings: string[] = [];
    try {
      const intake = await processReferralIntake(formData, uploads);
      intakeWarnings = intake.warnings;
      await sendReferralIntakeAdminNotice({
        clientName: String(clientName),
        claimNumber: intake.claimNumber,
        clientId: intake.clientId,
        warnings: intake.warnings,
        formDetails,
        replyTo,
        attachments,
      });
    } catch (intakeError) {
      console.error("Referral intake error:", intakeError);
      intakeWarnings = [
        intakeError instanceof Error ? intakeError.message : "Client record creation failed.",
      ];
      await sendReferralIntakeFailedNotice({
        clientName: String(clientName),
        formDetails,
        errorMessage: intakeWarnings[0]!,
        replyTo,
        attachments,
      });
    }

    return NextResponse.json({ ok: true, warnings: intakeWarnings });
  } catch (error) {
    console.error("Referral form error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit referral." },
      { status: 500 },
    );
  }
}
