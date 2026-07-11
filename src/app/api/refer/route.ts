import { NextRequest, NextResponse } from "next/server";
import {
  collectReferralUploads,
  processReferralIntake,
  UploadValidationError,
} from "@/lib/referral-intake";
import {
  sendReferralIntakeAdminNotice,
  sendReferralIntakeFailedNotice,
} from "@/lib/referral-emails";
import { clientIpFromRequest, enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

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

const REFER_RATE_LIMIT = 10;
const REFER_RATE_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(`refer:${clientIpFromRequest(request)}`, REFER_RATE_LIMIT, REFER_RATE_WINDOW_MS);

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

    const uploads = await collectReferralUploads(formData);

    for (const upload of uploads) {
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
      });
    } catch (intakeError) {
      console.error("Referral intake error:", intakeError);
      intakeWarnings = [
        intakeError instanceof Error ? intakeError.message : "Client record creation failed.",
      ];
      await sendReferralIntakeFailedNotice({
        clientName: String(clientName),
        claimNumber: String(formData.get("claimNumbers") ?? "").trim() || undefined,
        formDetails,
        errorMessage: intakeWarnings[0]!,
        replyTo,
      });
    }

    return NextResponse.json({ ok: true, warnings: intakeWarnings });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Referral form error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit referral." },
      { status: 500 },
    );
  }
}
