import { getValidGoogleAccessToken } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

/** Prefer a therapist's own OAuth connection; fall back to the initiator (e.g. admin). */
export async function resolveOAuthUserIdForTherapist(
  therapistId: string,
  fallbackUserId: string,
): Promise<string> {
  const connection = await prisma.googleDriveConnection.findUnique({
    where: { userId: therapistId },
    select: { id: true },
  });
  return connection ? therapistId : fallbackUserId;
}

export async function getDriveAccessTokenForUser(userId: string): Promise<string> {
  return getValidGoogleAccessToken(userId);
}

/** Try therapist, initiator, then system Drive account. */
export async function getDriveAccessTokenForClient(options: {
  therapistId?: string | null;
  initiatorUserId?: string;
}): Promise<string> {
  const tried = new Set<string>();

  if (options.therapistId) {
    try {
      return await getValidGoogleAccessToken(options.therapistId);
    } catch {
      tried.add(options.therapistId);
    }
  }

  if (options.initiatorUserId && !tried.has(options.initiatorUserId)) {
    try {
      return await getValidGoogleAccessToken(options.initiatorUserId);
    } catch {
      tried.add(options.initiatorUserId);
    }
  }

  const systemEmail =
    process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL?.trim() || "ghim@gvcounseling.com";
  const systemUser = await prisma.user.findFirst({
    where: { email: systemEmail, googleDriveConnection: { isNot: null } },
    select: { id: true },
  });
  if (systemUser && !tried.has(systemUser.id)) {
    return getValidGoogleAccessToken(systemUser.id);
  }

  throw new Error(
    "Google Drive is not connected. Connect your Google account in the portal integrations page.",
  );
}
