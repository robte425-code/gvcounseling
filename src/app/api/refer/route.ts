import { NextRequest, NextResponse } from "next/server";
import {
  collectReferralUploads,
  processReferralIntake,
  referralUploadsAsAttachments,
  UploadValidationError,
} from "@/lib/referral-intake";
import { extractPrimaryClaimNumber } from "@/lib/parse-referral-form";
import {
  sendReferralIntakeAdminNotice,
  sendReferralIntakeFailedNotice,
} from "@/lib/referral-emails";
import { clientIpFromRequest, enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { isSmokeTestRequest } from "@/lib/smoke-test";

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

    if (isSmokeTestRequest(request)) {
      return NextResponse.json({ ok: true, smoke: true });
    }

    const formData = await request.formData();

    const vrcName = formData.get("vrcName");
    const clientName = formData.get("clientName");

    if (!vrcName || !clientName) {
      return NextResponse.json({ error: "Required fields are missing." }, { status: 400 });
    }

    // Checked before the referral is accepted, so the VRC can correct it while
    // they still have the form and their files in front of them. A claim number
    // submitted as digits alone once cost a referral its claim status screen,
    // contacts screen and BHI approval letter, with the endpoint still answering
    // that the submission had been received.
    //
    // Only the shape is reported. Every other reason a referral can fail stays
    // unspoken: this endpoint is public, and saying that a claim number is
    // already on file tells anyone who guesses one that the worker is a patient
    // here. The shape of a claim number gives away nothing about anybody.
    const claimNumbers = String(formData.get("claimNumbers") ?? "");
    if (!extractPrimaryClaimNumber(claimNumbers)) {
      return NextResponse.json(
        {
          error:
            "That does not look like an L&I claim number. They begin with one or two letters followed by digits, such as BL12687. Please check the Claim and Account Center and try again.",
        },
        { status: 400 },
      );
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

    try {
      const intake = await processReferralIntake(formData, uploads);
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
      // Admins get the real reason; the caller does not. This endpoint is public,
      // and messages like "a client with claim number X already exists" told anyone
      // who guessed a claim number that the worker is a patient here.
      //
      // The referral's files go out with the notice. Intake failing means they
      // never reached Drive, and they exist nowhere else once this request ends.
      const { attachments, omitted } = referralUploadsAsAttachments(uploads);
      await sendReferralIntakeFailedNotice({
        clientName: String(clientName),
        claimNumber: claimNumbers.trim() || undefined,
        formDetails: omitted.length
          ? `${formDetails}\n\nToo large to attach: ${omitted.join(", ")}`
          : formDetails,
        errorMessage:
          intakeError instanceof Error ? intakeError.message : "Client record creation failed.",
        replyTo,
        attachments,
      });
    }

    // Warnings are internal notes about the parsed referral, so they are not echoed
    // back either — the response says only that the referral was received.
    return NextResponse.json({ ok: true, warnings: [] });
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
