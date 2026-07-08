import {
  getAdminNotificationEmails,
  getTherapistOutboundEmailRoute,
  getVrcOutboundEmailRoute,
  type OutboundEmailRoute,
} from "@/lib/portal-settings";

export type ResolvedOutboundEmail = {
  to: string;
  redirected: boolean;
  intendedEmail: string;
};

async function resolveOutboundEmail(
  intendedEmail: string,
  route: OutboundEmailRoute,
): Promise<ResolvedOutboundEmail> {
  const trimmed = intendedEmail.trim();
  if (route === "admin") {
    const adminEmails = await getAdminNotificationEmails();
    return {
      to: adminEmails.join(", "),
      redirected: true,
      intendedEmail: trimmed,
    };
  }
  return { to: trimmed, redirected: false, intendedEmail: trimmed };
}

export async function resolveVrcOutboundEmail(
  intendedEmail: string,
): Promise<ResolvedOutboundEmail> {
  const route = await getVrcOutboundEmailRoute();
  return resolveOutboundEmail(intendedEmail, route);
}

export async function resolveTherapistOutboundEmail(
  intendedEmail: string,
): Promise<ResolvedOutboundEmail> {
  const route = await getTherapistOutboundEmailRoute();
  return resolveOutboundEmail(intendedEmail, route);
}

export function outboundEmailRedirectNote(label: string, intendedEmail: string): string {
  return `\n\n[Email testing mode: this message would have gone to ${label} <${intendedEmail}>.]`;
}

/** Admin addresses to Cc on VRC emails (skips addresses already in To when redirected). */
export async function resolveAdminCcForVrcEmail(to: string): Promise<string | undefined> {
  const adminEmails = await getAdminNotificationEmails();
  const toSet = new Set(
    to
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const cc = adminEmails.filter((email) => !toSet.has(email.toLowerCase()));
  return cc.length > 0 ? cc.join(", ") : undefined;
}
