import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth, getRealRole, getRealUserId } from "@/auth";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  getGoogleOAuthConfig,
  getGoogleOAuthStateCookieName,
} from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

function importRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/portal/admin/clients/import", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || getRealRole(session) !== "ADMIN") {
    const login = new URL("/portal/login", request.url);
    login.searchParams.set("callbackUrl", "/portal/admin/clients/import");
    return NextResponse.redirect(login);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return importRedirect(request, { driveError: oauthError });
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(getGoogleOAuthStateCookieName())?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return importRedirect(request, {
      driveError: "Invalid OAuth state. Try connecting again.",
    });
  }

  try {
    getGoogleOAuthConfig();
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return importRedirect(request, {
        driveError:
          "Google did not return a refresh token. Disconnect the app in your Google account settings and try again.",
      });
    }

    const googleEmail = await fetchGoogleUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const adminUserId = getRealUserId(session);
    await prisma.googleDriveConnection.upsert({
      where: { userId: adminUserId },
      create: {
        userId: adminUserId,
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

    const response = importRedirect(request, { driveConnected: "1" });
    response.cookies.set(getGoogleOAuthStateCookieName(), "", { maxAge: 0, path: "/" });
    return response;
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return importRedirect(request, {
      driveError: e instanceof Error ? e.message : "Google connection failed.",
    });
  }
}
