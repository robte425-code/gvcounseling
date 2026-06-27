import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth, getRealRole, isImpersonating } from "@/auth";
import { buildGoogleAuthUrl, getGoogleOAuthStateCookieName } from "@/lib/google-oauth";
import { googleDriveIntegrationsPath } from "@/lib/google-drive-oauth-redirect";

function integrationsErrorRedirect(request: Request, role: "ADMIN" | "THERAPIST", message: string) {
  const url = new URL(googleDriveIntegrationsPath(role), request.url);
  url.searchParams.set("driveError", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    const login = new URL("/portal/login", request.url);
    login.searchParams.set("callbackUrl", "/api/portal/integrations/google/connect");
    return NextResponse.redirect(login);
  }

  if (isImpersonating(session)) {
    return integrationsErrorRedirect(
      request,
      "ADMIN",
      "Exit therapist view before connecting Google Drive.",
    );
  }

  const role = getRealRole(session);
  if (role !== "ADMIN" && role !== "THERAPIST") {
    return NextResponse.redirect(new URL("/portal/login", request.url));
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
    return integrationsErrorRedirect(
      request,
      role,
      e instanceof Error ? e.message : "Google OAuth is not configured.",
    );
  }
}
