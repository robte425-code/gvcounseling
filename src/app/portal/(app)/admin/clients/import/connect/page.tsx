import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/auth";
import { buildGoogleAuthUrl, getGoogleOAuthStateCookieName } from "@/lib/google-oauth";

export default async function ConnectGoogleDrivePage() {
  await requireAdmin();

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(getGoogleOAuthStateCookieName(), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  let authUrl: string;
  try {
    authUrl = buildGoogleAuthUrl(state);
  } catch (e) {
    const message = encodeURIComponent(
      e instanceof Error ? e.message : "Google OAuth is not configured.",
    );
    redirect(`/portal/admin/clients/import?driveError=${message}`);
  }

  redirect(authUrl);
}
