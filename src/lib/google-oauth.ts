import { prisma } from "@/lib/prisma";

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

const OAUTH_STATE_COOKIE = "google_oauth_state";

export function getGoogleOAuthStateCookieName() {
  return OAUTH_STATE_COOKIE;
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? "Google token request failed.");
  }
  return data;
}

export async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  return postToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const connection = await prisma.googleDriveConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error("Google Drive is not connected. Connect your account first.");
  }

  const bufferMs = 60_000;
  if (connection.expiresAt.getTime() > Date.now() + bufferMs) {
    return connection.accessToken;
  }

  const tokens = await refreshAccessToken(connection.refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleDriveConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: tokens.access_token,
      expiresAt,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    },
  });

  return tokens.access_token;
}
