import { sendEmailTo } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import {
  outboundEmailRedirectNote,
  resolveTherapistOutboundEmail,
  resolveVrcOutboundEmail,
} from "@/lib/outbound-email-routing";
import {
  VRC_BILLING_EMAIL_SIGNATURE,
  vrcFirstName,
} from "@/lib/vrc-billing-emails";

function referralEmailSubject(subject: string): string {
  return subject.replace(/^\[TEST\]\s*/i, "");
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
}) {
  const intendedVrcEmail = options.vrcEmail.trim();
  const { to, redirected } = await resolveVrcOutboundEmail(intendedVrcEmail);
  const greetingName = vrcFirstName(options.vrcName);
  await sendEmailTo(to, {
    subject: referralEmailSubject(
      `Referral received: ${options.clientName} (${options.claimNumber})`,
    ),
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
      redirected
        ? outboundEmailRedirectNote(options.vrcName || "VRC", intendedVrcEmail)
        : "",
    ].join("\n"),
  });
  return { to, redirected };
}

export async function sendVrcReferralInfoRequestEmail(options: {
  vrcEmail: string;
  vrcName: string;
  clientName: string;
  claimNumber: string;
  message: string;
  replyToEmail: string;
}) {
  const intendedVrcEmail = options.vrcEmail.trim();
  const { to, redirected } = await resolveVrcOutboundEmail(intendedVrcEmail);
  const greetingName = vrcFirstName(options.vrcName);
  await sendEmailTo(to, {
    subject: referralEmailSubject(
      `More information needed: ${options.clientName} (${options.claimNumber})`,
    ),
    replyTo: options.replyToEmail,
    text: [
      `Dear ${greetingName},`,
      "",
      `Regarding your referral for ${options.clientName} (Claim #${options.claimNumber}):`,
      "",
      options.message,
      "",
      "Please reply to this email with any additional information.",
      "",
      vrcEmailSignatureBlock(),
      redirected
        ? outboundEmailRedirectNote(options.vrcName || "VRC", intendedVrcEmail)
        : "",
    ].join("\n"),
  });
  return { to, redirected };
}

export async function sendTherapistAssignmentEmail(options: {
  therapistEmail: string;
  therapistName: string;
  clientName: string;
  claimNumber: string;
  clientId: string;
}) {
  const intendedEmail = options.therapistEmail.trim();
  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const siteUrl = getSiteUrl();
  const acceptUrl = `${siteUrl}/portal/therapist/referrals/${options.clientId}`;
  await sendEmailTo(to, {
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
      redirected ? outboundEmailRedirectNote(options.therapistName, intendedEmail) : "",
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
  await sendAdminTherapistClientStatusEmail({
    adminEmails: [options.adminEmail],
    therapistName: options.therapistName,
    action: "rejected",
    clientName: options.clientName,
    claimNumber: options.claimNumber,
    reason: options.reason,
    clientId: options.clientId,
  });
}

export async function sendAdminTherapistClientStatusEmail(options: {
  adminEmails: string[];
  therapistName: string;
  action: "closed" | "reopened" | "rejected";
  clientName: string;
  claimNumber: string;
  reason: string;
  clientId: string;
}) {
  const recipients = options.adminEmails.map((email) => email.trim()).filter(Boolean);
  if (recipients.length === 0) return;

  const actionLabels: Record<typeof options.action, string> = {
    closed: "closed",
    reopened: "reopened",
    rejected: "declined/rejected",
  };
  const clientUrl = `${getSiteUrl()}/portal/admin/clients/${options.clientId}`;
  await sendEmailTo(recipients.join(", "), {
    subject: `Therapist ${actionLabels[options.action]} client: ${options.clientName} (${options.claimNumber})`,
    text: [
      `${options.therapistName} ${actionLabels[options.action]} the client ${options.clientName} (${options.claimNumber}).`,
      "",
      "Reason:",
      options.reason,
      "",
      "View client in the portal:",
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
  const intendedEmail = options.therapistEmail.trim();
  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
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
  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }
  await sendEmailTo(to, {
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
