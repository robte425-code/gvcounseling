import { NextResponse } from "next/server";
import { sendPaymentDueReminderEmails } from "@/lib/payment-due-reminder-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendPaymentDueReminderEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Payment due reminder cron failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed." },
      { status: 500 },
    );
  }
}
