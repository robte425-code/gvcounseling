import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { clientIpFromRequest, enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { isSmokeTestRequest } from "@/lib/smoke-test";

const CONTACT_RATE_LIMIT = 20;
const CONTACT_RATE_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(
      `contact:${clientIpFromRequest(request)}`,
      CONTACT_RATE_LIMIT,
      CONTACT_RATE_WINDOW_MS,
    );

    if (isSmokeTestRequest(request)) {
      return NextResponse.json({ ok: true, smoke: true });
    }

    const body = await request.json();
    const { firstName, lastName, email, message } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const name = [firstName, lastName].filter(Boolean).join(" ") || "Website visitor";

    await sendEmail({
      subject: `Contact form: ${name}`,
      replyTo: email,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        "",
        "Message:",
        message || "(No message provided)",
      ].join("\n"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send message." },
      { status: 500 },
    );
  }
}
