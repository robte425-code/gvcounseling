import { sendEmailTo } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import {
  outboundEmailRedirectNote,
  resolveAdminCcForVrcEmail,
  resolveTherapistOutboundEmail,
  resolveVrcOutboundEmail,
} from "@/lib/outbound-email-routing";
import { getAdminNotificationEmails } from "@/lib/portal-settings";
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
  const cc = await resolveAdminCcForVrcEmail(to);
  await sendEmailTo(to, {
    subject: referralEmailSubject(`Referral received: ${options.claimNumber}`),
    cc,
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
  const cc = await resolveAdminCcForVrcEmail(to);
  await sendEmailTo(to, {
    subject: referralEmailSubject(`More information needed: ${options.claimNumber}`),
    replyTo: options.replyToEmail,
    cc,
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

export async function sendAdminTherapistAcceptedClientEmail(options: {
  therapistName: string;
  clientName: string;
  claimNumber: string;
  clientId: string;
}) {
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const clientUrl = `${getSiteUrl()}/portal/admin/clients/${options.clientId}`;
  await sendEmailTo(adminEmails.join(", "), {
    subject: `Therapist accepted client: ${options.claimNumber}`,
    text: [
      `${options.therapistName} accepted the client referral for ${options.clientName} (${options.claimNumber}).`,
      "",
      "The client is now active on their caseload.",
      "",
      "View client in the portal:",
      clientUrl,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

function truncateNoteBody(body: string, maxLength = 800): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

export async function sendAdminClientNoteEmail(options: {
  therapistName: string;
  clientName: string;
  claimNumber: string;
  clientId: string;
  noteBody: string;
}) {
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const clientUrl = `${getSiteUrl()}/portal/admin/clients/${options.clientId}`;
  await sendEmailTo(adminEmails.join(", "), {
    subject: `Therapist note: ${options.claimNumber}`,
    text: [
      `${options.therapistName} added a note for ${options.clientName} (${options.claimNumber}).`,
      "",
      "Note:",
      truncateNoteBody(options.noteBody),
      "",
      "View client in the portal:",
      clientUrl,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

export async function sendTherapistClientNoteEmail(options: {
  therapistEmail: string;
  therapistName: string;
  adminName: string;
  clientName: string;
  claimNumber: string;
  clientId: string;
  noteBody: string;
}) {
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const clientUrl = `${getSiteUrl()}/portal/therapist/clients/${options.clientId}`;
  const lines = [
    `Hello ${options.therapistName},`,
    "",
    `${options.adminName} added a note for ${options.clientName} (${options.claimNumber}).`,
    "",
    "Note:",
    truncateNoteBody(options.noteBody),
    "",
    "View this client in the portal:",
    clientUrl,
    "",
    "Grandview Counseling",
  ];
  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: `Admin note: ${options.claimNumber}`,
    text: lines.join("\n"),
  });
}

export async function sendAdminInvoiceNoteEmail(options: {
  therapistName: string;
  invoiceNumber: number;
  clientName: string;
  claimNumber: string;
  invoiceId: string;
  noteBody: string;
}) {
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const invoiceUrl = `${getSiteUrl()}/portal/admin/invoices/${options.invoiceId}`;
  await sendEmailTo(adminEmails.join(", "), {
    subject: `Therapist invoice note: #${options.invoiceNumber} (${options.claimNumber})`,
    text: [
      `${options.therapistName} added a note on invoice #${options.invoiceNumber} for ${options.clientName} (${options.claimNumber}).`,
      "",
      "Note:",
      truncateNoteBody(options.noteBody),
      "",
      "View invoice in the portal:",
      invoiceUrl,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

export async function sendTherapistInvoiceNoteEmail(options: {
  therapistEmail: string;
  therapistName: string;
  adminName: string;
  invoiceNumber: number;
  clientName: string;
  claimNumber: string;
  invoiceId: string;
  noteBody: string;
}) {
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const invoiceUrl = `${getSiteUrl()}/portal/therapist/invoices/${options.invoiceId}`;
  const lines = [
    `Hello ${options.therapistName},`,
    "",
    `${options.adminName} added a note on invoice #${options.invoiceNumber} for ${options.clientName} (${options.claimNumber}).`,
    "",
    "Note:",
    truncateNoteBody(options.noteBody),
    "",
    "View this invoice in the portal:",
    invoiceUrl,
    "",
    "Grandview Counseling",
  ];
  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: `Admin invoice note: #${options.invoiceNumber} (${options.claimNumber})`,
    text: lines.join("\n"),
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
    subject: `Therapist ${actionLabels[options.action]} client: ${options.claimNumber}`,
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

export async function sendAdminLniFaxNotificationEmail(options: {
  clientId: string;
  clientName: string;
  claimNumber: string;
  sentBy: string;
  faxJobId: string;
  destinationLabel: string;
  filenames: string[];
  driveFolderName?: string;
}) {
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const clientUrl = `${getSiteUrl()}/portal/admin/clients/${options.clientId}`;
  await sendEmailTo(adminEmails.join(", "), {
    subject: `L&I fax sent: ${options.claimNumber}`,
    text: [
      `An L&I fax was sent for ${options.clientName} (Claim #${options.claimNumber}).`,
      "",
      `Sent by: ${options.sentBy}`,
      `Destination: ${options.destinationLabel}`,
      `Fax job #: ${options.faxJobId}`,
      options.driveFolderName ? `Saved to Drive: ${options.driveFolderName}` : null,
      "",
      "Files:",
      ...options.filenames.map((name) => `- ${name}`),
      "",
      "View client in the portal:",
      clientUrl,
      "",
      "Grandview Counseling",
    ]
      .filter((line): line is string => line != null)
      .join("\n"),
  });
}

export async function sendTherapistLniFaxAcknowledgementEmail(options: {
  therapistEmail: string;
  therapistName: string;
  clientId: string;
  clientName: string;
  claimNumber: string;
  faxJobId: string;
  destinationLabel: string;
  filenames: string[];
  driveFolderName?: string;
}) {
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const clientUrl = `${getSiteUrl()}/portal/therapist/clients/${options.clientId}`;
  const lines = [
    `Hello ${options.therapistName},`,
    "",
    `Your L&I fax for ${options.clientName} (Claim #${options.claimNumber}) has been queued.`,
    "",
    `Destination: ${options.destinationLabel}`,
    `Fax job #: ${options.faxJobId}`,
    options.driveFolderName ? `Saved to Drive: ${options.driveFolderName}` : null,
    "",
    "Files:",
    ...options.filenames.map((name) => `- ${name}`),
    "",
    "View this client in the portal:",
    clientUrl,
    "",
    "Grandview Counseling",
  ];
  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: `L&I fax queued: ${options.claimNumber}`,
    text: lines.filter((line): line is string => line != null).join("\n"),
  });
}

export async function sendTherapistPasswordResetEmail(options: {
  therapistEmail: string;
  therapistName: string;
  resetUrl: string;
}) {
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const lines = [
    `Hello ${options.therapistName},`,
    "",
    "We received a request to reset your Grandview Counseling billing portal password.",
    "",
    "Reset your password here (link expires in 1 hour):",
    options.resetUrl,
    "",
    "If you did not request this, you can ignore this email. Your password will not change.",
    "",
    "Grandview Counseling",
  ];
  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: "Reset your billing portal password",
    text: lines.join("\n"),
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
    subject: `New referral: ${options.claimNumber}`,
    replyTo: options.replyTo,
    text: lines.join("\n"),
    attachments: options.attachments,
  });
}

export async function sendReferralIntakeFailedNotice(options: {
  clientName: string;
  claimNumber?: string;
  formDetails: string;
  errorMessage: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}) {
  const adminEmail = process.env.CONTACT_EMAIL?.trim() || "ghim@gvcounseling.com";
  const claimLabel = options.claimNumber?.trim();
  await sendEmailTo(adminEmail, {
    subject: claimLabel ? `Referral intake failed: ${claimLabel}` : "Referral intake failed",
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
