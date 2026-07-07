import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, getRealRole, getRealUserId, isImpersonating } from "@/auth";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  getGoogleOAuthConfig,
  getGoogleOAuthStateCookieName,
} from "@/lib/google-oauth";
import {
  GOOGLE_DRIVE_ADMIN_PAGE,
  googleDriveIntegrationsPath,
} from "@/lib/google-drive-oauth-redirect";
import { prisma } from "@/lib/prisma";

function importRedirect(request: Request, role: "ADMIN" | "THERAPIST", params: Record<string, string>) {
  const url = new URL(googleDriveIntegrationsPath(role), request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    const login = new URL("/portal/login", request.url);
    login.searchParams.set("callbackUrl", GOOGLE_DRIVE_ADMIN_PAGE);
    return NextResponse.redirect(login);
  }

  if (isImpersonating(session)) {
    return importRedirect(request, "ADMIN", {
      driveError: "Exit therapist view before connecting Google Drive.",
    });
  }

  const role = getRealRole(session);
  if (role !== "ADMIN" && role !== "THERAPIST") {
    const login = new URL("/portal/login", request.url);
    login.searchParams.set("callbackUrl", GOOGLE_DRIVE_ADMIN_PAGE);
    return NextResponse.redirect(login);
  }

  if (role === "THERAPIST") {
    return NextResponse.redirect(new URL("/portal/therapist/dashboard", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return importRedirect(request, role, { driveError: oauthError });
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(getGoogleOAuthStateCookieName())?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return importRedirect(request, role, {
      driveError: "Invalid OAuth state. Try connecting again.",
    });
  }

  try {
    getGoogleOAuthConfig();
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return importRedirect(request, role, {
        driveError:
          "Google did not return a refresh token. Disconnect the app in your Google account settings and try again.",
      });
    }

    const googleEmail = await fetchGoogleUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const userId = getRealUserId(session);
    await prisma.googleDriveConnection.upsert({
      where: { userId },
      create: {
        userId,
        googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
      update: {
        googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
    });

    const response = importRedirect(request, role, { driveConnected: "1" });
    response.cookies.set(getGoogleOAuthStateCookieName(), "", { maxAge: 0, path: "/" });
    return response;
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return importRedirect(request, role, {
      driveError: e instanceof Error ? e.message : "Google connection failed.",
    });
  }
}
