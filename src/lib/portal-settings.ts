import { prisma } from "@/lib/prisma";
import { connection } from "next/server";
import {
  DEFAULT_CUTOFF_REMINDER_DAYS_EARLIER,
  DEFAULT_CUTOFF_REMINDER_DAYS_LATER,
  MAX_CUTOFF_REMINDER_DAYS,
  MIN_CUTOFF_REMINDER_DAYS,
  normalizeCutoffReminderDays,
  parseCutoffReminderDays,
  type CutoffReminderDays,
} from "@/lib/cutoff-reminder-settings";
import { getIsaUsageIndicator, type IsaUsageIndicator } from "@/lib/edi837";

export const OUTBOUND_VRC_EMAIL_KEY = "outbound_vrc_email_destination";
export const OUTBOUND_THERAPIST_EMAIL_KEY = "outbound_therapist_email_destination";
export const OUTBOUND_LNI_FAX_KEY = "outbound_lni_fax_destination";
export const CUTOFF_REMINDER_DAYS_EARLIER_KEY = "cutoff_reminder_days_earlier";
export const CUTOFF_REMINDER_DAYS_LATER_KEY = "cutoff_reminder_days_later";
export const BILLING_ISA_USAGE_INDICATOR_KEY = "billing_isa_usage_indicator";
export const PENDING_837_ARCHIVE_CUTOFF_KEY = "pending_837_archive_cutoff";
export const PENDING_837_ARCHIVE_USAGE_KEY = "pending_837_archive_usage";
/** @deprecated Legacy key — read as fallback for VRC routing only. */
export const VRC_REFERRAL_EMAIL_DESTINATION_KEY = "vrc_referral_email_destination";

export type OutboundEmailRoute = "intended" | "admin";
export type OutboundLniFaxRoute = "lni" | "test";

export {
  DEFAULT_CUTOFF_REMINDER_DAYS_EARLIER,
  DEFAULT_CUTOFF_REMINDER_DAYS_LATER,
  MAX_CUTOFF_REMINDER_DAYS,
  MIN_CUTOFF_REMINDER_DAYS,
  normalizeCutoffReminderDays,
  parseCutoffReminderDays,
  type CutoffReminderDays,
} from "@/lib/cutoff-reminder-settings";

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

export function parseIsaUsageIndicatorSetting(
  value: string | null | undefined,
): IsaUsageIndicator | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized === "T" || normalized === "P" ? normalized : undefined;
}

/** Sticky Bill L&I Test/Production mode (ISA15). Falls back to env default. */
export async function getBillingIsaUsageIndicator(): Promise<IsaUsageIndicator> {
  const current = await readPortalSetting(BILLING_ISA_USAGE_INDICATOR_KEY);
  return parseIsaUsageIndicatorSetting(current) ?? getIsaUsageIndicator();
}

export async function setBillingIsaUsageIndicator(value: IsaUsageIndicator): Promise<void> {
  const parsed = parseIsaUsageIndicatorSetting(value);
  if (!parsed) throw new Error("Invalid 837 usage indicator.");
  await prisma.portalSetting.upsert({
    where: { key: BILLING_ISA_USAGE_INDICATOR_KEY },
    create: { key: BILLING_ISA_USAGE_INDICATOR_KEY, value: parsed },
    update: { value: parsed },
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

export async function getCutoffReminderDays(): Promise<CutoffReminderDays> {
  const [earlierRaw, laterRaw] = await Promise.all([
    readPortalSetting(CUTOFF_REMINDER_DAYS_EARLIER_KEY),
    readPortalSetting(CUTOFF_REMINDER_DAYS_LATER_KEY),
  ]);
  const earlier =
    parseCutoffReminderDays(earlierRaw) ?? DEFAULT_CUTOFF_REMINDER_DAYS_EARLIER;
  const later = parseCutoffReminderDays(laterRaw) ?? DEFAULT_CUTOFF_REMINDER_DAYS_LATER;
  return normalizeCutoffReminderDays(earlier, later);
}

export async function setCutoffReminderDays(
  earlierDays: number,
  laterDays: number,
): Promise<CutoffReminderDays> {
  const earlier = parseCutoffReminderDays(String(earlierDays));
  const later = parseCutoffReminderDays(String(laterDays));
  if (earlier == null || later == null) {
    throw new Error(
      `Cutoff reminder days must be integers from ${MIN_CUTOFF_REMINDER_DAYS} to ${MAX_CUTOFF_REMINDER_DAYS}.`,
    );
  }
  if (earlier === later) {
    throw new Error("The two reminder days must be different.");
  }
  const normalized = normalizeCutoffReminderDays(earlier, later);
  await Promise.all([
    prisma.portalSetting.upsert({
      where: { key: CUTOFF_REMINDER_DAYS_EARLIER_KEY },
      create: { key: CUTOFF_REMINDER_DAYS_EARLIER_KEY, value: String(normalized.earlierDays) },
      update: { value: String(normalized.earlierDays) },
    }),
    prisma.portalSetting.upsert({
      where: { key: CUTOFF_REMINDER_DAYS_LATER_KEY },
      create: { key: CUTOFF_REMINDER_DAYS_LATER_KEY, value: String(normalized.laterDays) },
      update: { value: String(normalized.laterDays) },
    }),
  ]);
  return normalized;
}

export function cutoffReminderSentKey(payPeriodId: string, daysBefore: number): string {
  return `cutoff_reminder_sent:${payPeriodId}:${daysBefore}`;
}

export async function wasCutoffReminderSent(
  payPeriodId: string,
  daysBefore: number,
): Promise<boolean> {
  const value = await readPortalSetting(cutoffReminderSentKey(payPeriodId, daysBefore));
  return Boolean(value);
}

export async function markCutoffReminderSent(
  payPeriodId: string,
  daysBefore: number,
  sentAt = new Date(),
): Promise<void> {
  const key = cutoffReminderSentKey(payPeriodId, daysBefore);
  const value = sentAt.toISOString();
  await prisma.portalSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
