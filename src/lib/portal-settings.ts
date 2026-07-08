import { prisma } from "@/lib/prisma";
import { connection } from "next/server";

export const VRC_REFERRAL_EMAIL_DESTINATION_KEY = "vrc_referral_email_destination";

export type VrcReferralEmailDestination = "vrc" | "admin";

export function parseVrcReferralEmailDestination(
  value: string | null | undefined,
): VrcReferralEmailDestination | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "vrc" || normalized === "admin" ? normalized : undefined;
}

export function defaultVrcReferralEmailDestination(): VrcReferralEmailDestination {
  return "vrc";
}

export async function getVrcReferralEmailDestination(): Promise<VrcReferralEmailDestination> {
  await connection();
  const row = await prisma.portalSetting.findUnique({
    where: { key: VRC_REFERRAL_EMAIL_DESTINATION_KEY },
    select: { value: true },
  });
  return parseVrcReferralEmailDestination(row?.value) ?? defaultVrcReferralEmailDestination();
}

export async function setVrcReferralEmailDestination(
  destination: VrcReferralEmailDestination,
): Promise<void> {
  await prisma.portalSetting.upsert({
    where: { key: VRC_REFERRAL_EMAIL_DESTINATION_KEY },
    create: { key: VRC_REFERRAL_EMAIL_DESTINATION_KEY, value: destination },
    update: { value: destination },
  });
}

export async function getAdminNotificationEmails(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { email: true },
    orderBy: { email: "asc" },
  });
  const emails = admins.map((admin) => admin.email.trim()).filter(Boolean);
  if (emails.length > 0) return emails;
  const fallback = process.env.CONTACT_EMAIL?.trim() || "ghim@gvcounseling.com";
  return [fallback];
}
