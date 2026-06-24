import { prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-oauth";

/** OAuth token for server-side Drive writes (referral intake, folder moves). */
export async function getSystemDriveAccessToken(): Promise<{
  accessToken: string;
  userId: string;
}> {
  const email =
    process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL?.trim() || "ghim@gvcounseling.com";
  const user = await prisma.user.findFirst({
    where: { email, googleDriveConnection: { isNot: null } },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `Google Drive is not connected for ${email}. An admin must connect Drive with write access in the portal.`,
    );
  }
  const accessToken = await getValidGoogleAccessToken(user.id);
  return { accessToken, userId: user.id };
}
