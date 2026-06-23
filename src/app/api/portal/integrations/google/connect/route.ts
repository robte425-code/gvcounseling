import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { buildGoogleAuthUrl, getGoogleOAuthStateCookieName } from "@/lib/google-oauth";

export async function GET() {
  await requireAdmin();

  try {
    const state = randomBytes(24).toString("hex");
    const url = buildGoogleAuthUrl(state);
    const response = NextResponse.redirect(url);

    response.cookies.set(getGoogleOAuthStateCookieName(), state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Google OAuth is not configured.";
    return NextResponse.redirect(
      `/portal/admin/clients/import?driveError=${encodeURIComponent(message)}`,
    );
  }
}
