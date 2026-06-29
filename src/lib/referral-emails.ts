import { sendEmailTo } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

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
    subject: `Accept new client referral: ${options.clientName} (${options.claimNumber})`,
    text: [
      `Hello ${options.therapistName},`,
      "",
      `You have been assigned a new client referral at Grandview Counseling.`,
      "",
      `  Client: ${options.clientName}`,
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
    "Optional: connect your Google account under Integrations to view client files.",
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
