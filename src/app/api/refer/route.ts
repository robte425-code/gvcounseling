import { NextRequest, NextResponse } from "next/server";
import { collectReferralUploads, processReferralIntake } from "@/lib/referral-intake";
import { sendEmail } from "@/lib/email";
import { sendReferralIntakeAdminNotice } from "@/lib/referral-emails";

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

    await sendEmail({
      subject: `Client referral: ${clientName}`,
      replyTo: String(formData.get("vrcEmail") || ""),
      text: lines.join("\n"),
      attachments,
    });

    let intakeWarnings: string[] = [];
    try {
      const intake = await processReferralIntake(formData, uploads);
      intakeWarnings = intake.warnings;
      await sendReferralIntakeAdminNotice({
        clientName: String(clientName),
        claimNumber: intake.claimNumber,
        clientId: intake.clientId,
        warnings: intake.warnings,
      });
    } catch (intakeError) {
      console.error("Referral intake error:", intakeError);
      intakeWarnings = [
        intakeError instanceof Error ? intakeError.message : "Client record creation failed.",
      ];
      await sendEmail({
        subject: `Referral intake failed: ${clientName}`,
        text: [
          "The referral notification email was sent, but automatic client creation failed.",
          "",
          intakeError instanceof Error ? intakeError.message : String(intakeError),
        ].join("\n"),
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
