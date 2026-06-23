import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildGoogleAuthUrl, getGoogleOAuthStateCookieName } from "@/lib/google-oauth";

function importErrorRedirect(request: Request, message: string) {
  const url = new URL("/portal/admin/clients/import", request.url);
  url.searchParams.set("driveError", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    const login = new URL("/portal/login", request.url);
    login.searchParams.set("callbackUrl", "/api/portal/integrations/google/connect");
    return NextResponse.redirect(login);
  }

  try {
    const state = randomBytes(24).toString("hex");
    const authUrl = buildGoogleAuthUrl(state);
    const response = NextResponse.redirect(authUrl);

    response.cookies.set(getGoogleOAuthStateCookieName(), state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch (e) {
    return importErrorRedirect(
      request,
      e instanceof Error ? e.message : "Google OAuth is not configured.",
    );
  }
}
