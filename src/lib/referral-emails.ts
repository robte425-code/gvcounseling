import { sendEmailTo } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import {
  getAdminNotificationEmails,
  type VrcReferralEmailDestination,
} from "@/lib/portal-settings";
import {
  VRC_BILLING_EMAIL_SIGNATURE,
  getVrcEmailTestRecipient,
  vrcFirstName,
} from "@/lib/vrc-billing-emails";

function resolveVrcOutboundRecipient(vrcEmail: string): { to: string; testMode: boolean } {
  const redirect = process.env.VRC_EMAIL_REDIRECT_TO?.trim();
  if (redirect) {
    return { to: redirect, testMode: true };
  }
  return { to: vrcEmail, testMode: false };
}

async function resolveVrcReferralRecipients(options: {
  destination: VrcReferralEmailDestination;
  vrcEmail: string;
}): Promise<{ to: string; adminMode: boolean; envTestMode: boolean }> {
  if (options.destination === "admin") {
    const adminEmails = await getAdminNotificationEmails();
    return { to: adminEmails.join(", "), adminMode: true, envTestMode: false };
  }
  const { to, testMode } = resolveVrcOutboundRecipient(options.vrcEmail);
  return { to, adminMode: false, envTestMode: testMode };
}

function adminModeNote(intendedVrcEmail: string, vrcName: string): string {
  return [
    "",
    `[Admin preview mode: this email would have gone to ${vrcName} <${intendedVrcEmail}>.]`,
  ].join("\n");
}

function vrcEmailSignatureBlock(): string {
  const { name, phone, email } = VRC_BILLING_EMAIL_SIGNATURE;
  return [name, `M: ${phone}`, `E: ${email}`].join("\n");
}

export async function sendVrcReferralAcceptanceEmail(options: {
  vrcEmail: string;
  vrcName: string;
  clientName: string;
  claimNumber: string;
  destination?: VrcReferralEmailDestination;
}) {
  const destination = options.destination ?? "vrc";
  const { to, adminMode, envTestMode } = await resolveVrcReferralRecipients({
    destination,
    vrcEmail: options.vrcEmail,
  });
  const greetingName = adminMode ? "Admin team" : vrcFirstName(options.vrcName);
  const subjectPrefix = adminMode || envTestMode ? `[TEST] ` : "";
  await sendEmailTo(to, {
    subject: `${subjectPrefix}Referral received: ${options.clientName} (${options.claimNumber})`,
    text: [
      `Dear ${greetingName},`,
      "",
      `Thank you for referring ${options.clientName} (Claim #${options.claimNumber}) to Grandview Counseling.`,
      "",
      "We have received this new client referral and will contact the client to schedule a BHI session as soon as possible.",
      "",
      "Thank you again for the referral.",
      "",
      vrcEmailSignatureBlock(),
      adminMode ? adminModeNote(options.vrcEmail, options.vrcName) : "",
    ].join("\n"),
  });
  return { to, adminMode };
}

export async function sendVrcReferralInfoRequestEmail(options: {
  vrcEmail: string;
  vrcName: string;
  clientName: string;
  claimNumber: string;
  message: string;
  replyToEmail: string;
  destination?: VrcReferralEmailDestination;
}) {
  const destination = options.destination ?? "vrc";
  const { to, adminMode, envTestMode } = await resolveVrcReferralRecipients({
    destination,
    vrcEmail: options.vrcEmail,
  });
  const greetingName = adminMode ? "Admin team" : vrcFirstName(options.vrcName);
  const subjectPrefix = adminMode || envTestMode ? `[TEST] ` : "";
  const envTestNote = envTestMode && !adminMode
    ? `\n\n[Test mode: intended recipient ${options.vrcEmail}, redirected to ${getVrcEmailTestRecipient()}]`
    : "";
  await sendEmailTo(to, {
    subject: `${subjectPrefix}More information needed: ${options.clientName} (${options.claimNumber})`,
    replyTo: options.replyToEmail,
    text: [
      `Dear ${greetingName},`,
      "",
      `Regarding your referral for ${options.clientName} (Claim #${options.claimNumber}):`,
      "",
      options.message,
      "",
      adminMode
        ? "This is an admin preview of a VRC information request."
        : "Please reply to this email with any additional information.",
      "",
      vrcEmailSignatureBlock(),
      adminMode ? adminModeNote(options.vrcEmail, options.vrcName) : "",
      envTestNote,
    ].join("\n"),
  });
  return { to, adminMode };
}

export async function sendTherapistAssignmentEmail(options: {
  therapistEmail: string;
  therapistName: string;
  clientName: string;
  claimNumber: string;
  clientId: string;
}) {
  const siteUrl = getSiteUrl();
  const acceptUrl = `${siteUrl}/portal/therapist/referrals/${options.clientId}`;
  await sendEmailTo(options.therapistEmail, {
    subject: `New client referral: ${options.claimNumber}`,
    text: [
      `Hello ${options.therapistName},`,
      "",
      `You have been assigned a new client referral at Grandview Counseling.`,
      "",
      `  Claim #: ${options.claimNumber}`,
      "",
      `Please visit the portal to review the referral and accept or decline:`,
      acceptUrl,
      "",
      `You can also sign in at ${siteUrl}/portal — pending referrals appear on your dashboard.`,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

export async function sendAdminTherapistRejectionEmail(options: {
  adminEmail: string;
  therapistName: string;
  clientName: string;
  claimNumber: string;
  reason: string;
  clientId: string;
}) {
  const clientUrl = `${getSiteUrl()}/portal/admin/clients/${options.clientId}`;
  await sendEmailTo(options.adminEmail, {
    subject: `Therapist declined referral: ${options.clientName} (${options.claimNumber})`,
    text: [
      `${options.therapistName} declined the referral for ${options.clientName} (${options.claimNumber}).`,
      "",
      `Reason:`,
      options.reason,
      "",
      `The client is unassigned again. Review and reassign:`,
      clientUrl,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

export async function sendTherapistWelcomeEmail(options: {
  therapistEmail: string;
  therapistName: string;
  password: string;
  mustChangePassword: boolean;
}) {
  const siteUrl = getSiteUrl();
  const loginUrl = `${siteUrl}/portal/login`;
  const passwordLabel = options.mustChangePassword ? "Temporary password" : "Password";
  const lines = [
    `Hello ${options.therapistName},`,
    "",
    "An account has been created for you on the Grandview Counseling billing portal.",
    "",
    "Sign in here:",
    loginUrl,
    "",
    `  Email: ${options.therapistEmail}`,
    `  ${passwordLabel}: ${options.password}`,
  ];
  if (options.mustChangePassword) {
    lines.push("", "You will be asked to choose a new password when you sign in for the first time.");
  }
  lines.push(
    "",
    "From the portal you can review client referrals, manage clients, and submit invoices.",
    "",
    "If you did not expect this email, please contact the office.",
    "",
    "Grandview Counseling",
  );
  await sendEmailTo(options.therapistEmail, {
    subject: "Your Grandview Counseling billing portal account",
    text: lines.join("\n"),
  });
}

export async function sendAdminWelcomeEmail(options: {
  adminEmail: string;
  adminName: string;
  password: string;
  mustChangePassword: boolean;
}) {
  const siteUrl = getSiteUrl();
  const loginUrl = `${siteUrl}/portal/login`;
  const passwordLabel = options.mustChangePassword ? "Temporary password" : "Password";
  const lines = [
    `Hello ${options.adminName},`,
    "",
    "An admin account has been created for you on the Grandview Counseling billing portal.",
    "",
    "Sign in here:",
    loginUrl,
    "",
    `  Email: ${options.adminEmail}`,
    `  ${passwordLabel}: ${options.password}`,
  ];
  if (options.mustChangePassword) {
    lines.push("", "You will be asked to choose a new password when you sign in for the first time.");
  }
  lines.push(
    "",
    "From the portal you can manage clients, therapists, invoices, and L&I billing.",
    "",
    "If you did not expect this email, please contact the office.",
    "",
    "Grandview Counseling",
  );
  await sendEmailTo(options.adminEmail, {
    subject: "Your Grandview Counseling admin portal account",
    text: lines.join("\n"),
  });
}

export async function sendReferralIntakeAdminNotice(options: {
  clientName: string;
  claimNumber: string;
  clientId: string;
  warnings: string[];
  formDetails: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}) {
  const adminEmail = process.env.CONTACT_EMAIL?.trim() || "ghim@gvcounseling.com";
  const clientUrl = `${getSiteUrl()}/portal/admin/clients/${options.clientId}`;
  const lines = [
    `A new referral was submitted and a client record was created.`,
    "",
    `View client in the portal:`,
    clientUrl,
    "",
    `Client: ${options.clientName}`,
    `Claim #: ${options.claimNumber}`,
    "",
    "--- Referral form ---",
    "",
    options.formDetails,
  ];
  if (options.warnings.length) {
    lines.push("", "Notes:", ...options.warnings.map((w) => `- ${w}`));
  }
  await sendEmailTo(adminEmail, {
    subject: `New referral: ${options.clientName} (${options.claimNumber})`,
    replyTo: options.replyTo,
    text: lines.join("\n"),
    attachments: options.attachments,
  });
}

export async function sendReferralIntakeFailedNotice(options: {
  clientName: string;
  formDetails: string;
  errorMessage: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}) {
  const adminEmail = process.env.CONTACT_EMAIL?.trim() || "ghim@gvcounseling.com";
  await sendEmailTo(adminEmail, {
    subject: `Referral intake failed: ${options.clientName}`,
    replyTo: options.replyTo,
    text: [
      "A referral was submitted but automatic client creation failed.",
      "",
      "Error:",
      options.errorMessage,
      "",
      "--- Referral form ---",
      "",
      options.formDetails,
    ].join("\n"),
    attachments: options.attachments,
  });
}
