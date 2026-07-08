import { prisma } from "@/lib/prisma";
import { connection } from "next/server";

export const OUTBOUND_VRC_EMAIL_KEY = "outbound_vrc_email_destination";
export const OUTBOUND_THERAPIST_EMAIL_KEY = "outbound_therapist_email_destination";
export const OUTBOUND_LNI_FAX_KEY = "outbound_lni_fax_destination";
/** @deprecated Legacy key — read as fallback for VRC routing only. */
export const VRC_REFERRAL_EMAIL_DESTINATION_KEY = "vrc_referral_email_destination";

export type OutboundEmailRoute = "intended" | "admin";
export type OutboundLniFaxRoute = "lni" | "test";

export function parseOutboundEmailRoute(
  value: string | null | undefined,
): OutboundEmailRoute | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "intended" || normalized === "vrc") return "intended";
  if (normalized === "admin") return "admin";
  return undefined;
}

export function defaultOutboundEmailRoute(): OutboundEmailRoute {
  return "intended";
}

export function parseOutboundLniFaxRoute(
  value: string | null | undefined,
): OutboundLniFaxRoute | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "lni" || normalized === "test" ? normalized : undefined;
}

export function defaultOutboundLniFaxRoute(): OutboundLniFaxRoute {
  return "test";
}

async function readPortalSetting(key: string): Promise<string | null> {
  await connection();
  const row = await prisma.portalSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return row?.value ?? null;
}

export async function getVrcOutboundEmailRoute(): Promise<OutboundEmailRoute> {
  const current = await readPortalSetting(OUTBOUND_VRC_EMAIL_KEY);
  const parsed = parseOutboundEmailRoute(current);
  if (parsed) return parsed;

  const legacy = await readPortalSetting(VRC_REFERRAL_EMAIL_DESTINATION_KEY);
  return parseOutboundEmailRoute(legacy) ?? defaultOutboundEmailRoute();
}

export async function getTherapistOutboundEmailRoute(): Promise<OutboundEmailRoute> {
  const current = await readPortalSetting(OUTBOUND_THERAPIST_EMAIL_KEY);
  return parseOutboundEmailRoute(current) ?? defaultOutboundEmailRoute();
}

export async function setVrcOutboundEmailRoute(route: OutboundEmailRoute): Promise<void> {
  await prisma.portalSetting.upsert({
    where: { key: OUTBOUND_VRC_EMAIL_KEY },
    create: { key: OUTBOUND_VRC_EMAIL_KEY, value: route },
    update: { value: route },
  });
}

export async function setTherapistOutboundEmailRoute(route: OutboundEmailRoute): Promise<void> {
  await prisma.portalSetting.upsert({
    where: { key: OUTBOUND_THERAPIST_EMAIL_KEY },
    create: { key: OUTBOUND_THERAPIST_EMAIL_KEY, value: route },
    update: { value: route },
  });
}

export async function getLniOutboundFaxRoute(): Promise<OutboundLniFaxRoute> {
  const current = await readPortalSetting(OUTBOUND_LNI_FAX_KEY);
  return parseOutboundLniFaxRoute(current) ?? defaultOutboundLniFaxRoute();
}

export async function setLniOutboundFaxRoute(route: OutboundLniFaxRoute): Promise<void> {
  await prisma.portalSetting.upsert({
    where: { key: OUTBOUND_LNI_FAX_KEY },
    create: { key: OUTBOUND_LNI_FAX_KEY, value: route },
    update: { value: route },
  });
}

export async function getOutboundTestingSettings(): Promise<{
  vrcRoute: OutboundEmailRoute;
  therapistRoute: OutboundEmailRoute;
  lniFaxRoute: OutboundLniFaxRoute;
  adminEmails: string[];
}> {
  const [vrcRoute, therapistRoute, lniFaxRoute, adminEmails] = await Promise.all([
    getVrcOutboundEmailRoute(),
    getTherapistOutboundEmailRoute(),
    getLniOutboundFaxRoute(),
    getAdminNotificationEmails(),
  ]);
  return { vrcRoute, therapistRoute, lniFaxRoute, adminEmails };
}

/** @deprecated Use getOutboundTestingSettings */
export async function getOutboundEmailTestingSettings(): Promise<{
  vrcRoute: OutboundEmailRoute;
  therapistRoute: OutboundEmailRoute;
  adminEmails: string[];
}> {
  const settings = await getOutboundTestingSettings();
  return {
    vrcRoute: settings.vrcRoute,
    therapistRoute: settings.therapistRoute,
    adminEmails: settings.adminEmails,
  };
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
