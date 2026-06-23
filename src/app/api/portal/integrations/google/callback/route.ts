import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  getGoogleOAuthConfig,
  getGoogleOAuthStateCookieName,
} from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await requireAdmin();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `/portal/admin/clients/import?driveError=${encodeURIComponent(oauthError)}`,
    );
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(getGoogleOAuthStateCookieName())?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(
      `/portal/admin/clients/import?driveError=${encodeURIComponent("Invalid OAuth state. Try connecting again.")}`,
    );
  }

  try {
    getGoogleOAuthConfig();
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `/portal/admin/clients/import?driveError=${encodeURIComponent("Google did not return a refresh token. Disconnect the app in your Google account settings and try again.")}`,
      );
    }

    const googleEmail = await fetchGoogleUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.googleDriveConnection.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
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

    const response = NextResponse.redirect("/portal/admin/clients/import?driveConnected=1");
    response.cookies.set(getGoogleOAuthStateCookieName(), "", { maxAge: 0, path: "/" });
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Google connection failed.";
    return NextResponse.redirect(
      `/portal/admin/clients/import?driveError=${encodeURIComponent(message)}`,
    );
  }
}
