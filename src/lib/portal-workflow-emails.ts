import { sendEmailTo } from "@/lib/email";
import { formatCurrency, formatDate, calendarIsoFromDate, formatCalendarIso } from "@/lib/constants";
import {
  outboundEmailRedirectNote,
  resolveTherapistOutboundEmail,
} from "@/lib/outbound-email-routing";
import { getAdminNotificationEmails } from "@/lib/portal-settings";
import { getSiteUrl } from "@/lib/site-url";

export type InvoiceAttentionLine = {
  invoiceNumber: number;
  claimNumber: string;
  clientName: string;
  section: "DENIED" | "IN_PROCESS";
  serviceDates: string[];
  eobCodes: string[];
};

export type UnresolvedRemittanceLine = {
  claimNumber: string;
  patientName: string;
  section: string;
  matchNote: string | null;
};

export type PendingReferralItem = {
  clientId: string;
  clientName: string;
  claimNumber: string;
  therapistName: string;
  pendingSince: Date;
};

export type PayRunFinalizedInvoice = {
  invoiceNumber: number;
  claimNumber: string;
  therapistAmount: number;
};

function sectionLabel(section: "DENIED" | "IN_PROCESS"): string {
  return section === "DENIED" ? "Denied" : "In process";
}

function formatAttentionInvoiceLines(lines: InvoiceAttentionLine[]): string[] {
  return lines.map((line) => {
    const dates = line.serviceDates.length ? line.serviceDates.join(", ") : "n/a";
    const eobs = line.eobCodes.length ? ` · EOB ${line.eobCodes.join(", ")}` : "";
    return `- #${line.invoiceNumber} · ${line.claimNumber} · ${line.clientName} · ${sectionLabel(line.section)} · DOS ${dates}${eobs}`;
  });
}

export async function sendAdminInvoiceSubmittedEmail(options: {
  therapistName: string;
  invoiceNumber: number;
  invoiceId: string;
  clientName: string;
  claimNumber: string;
  totalAmount: number;
}) {
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const invoiceUrl = `${getSiteUrl()}/portal/admin/invoices/${options.invoiceId}`;
  await sendEmailTo(adminEmails.join(", "), {
    subject: `Invoice submitted: #${options.invoiceNumber} (${options.claimNumber})`,
    text: [
      `${options.therapistName} submitted invoice #${options.invoiceNumber}.`,
      "",
      `Client: ${options.clientName} (${options.claimNumber})`,
      `Amount: ${formatCurrency(options.totalAmount)}`,
      "",
      "View invoice in the portal:",
      invoiceUrl,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

export async function sendTherapistRaNeedsAttentionEmail(options: {
  therapistEmail: string;
  therapistName: string;
  remittanceNumber: string;
  remittanceAdviceId: string;
  lines: InvoiceAttentionLine[];
}) {
  if (options.lines.length === 0) return;
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const deniedCount = options.lines.filter((line) => line.section === "DENIED").length;
  const inProcessCount = options.lines.length - deniedCount;
  const payUrl = `${getSiteUrl()}/portal/therapist/invoices`;
  const body = [
    `Hello ${options.therapistName},`,
    "",
    `Remittance ${options.remittanceNumber} includes ${options.lines.length} of your invoice(s) that need attention:`,
    deniedCount ? `- Denied: ${deniedCount}` : null,
    inProcessCount ? `- In process: ${inProcessCount}` : null,
    "",
    ...formatAttentionInvoiceLines(options.lines),
    "",
    "Review your invoices in the portal:",
    payUrl,
    "",
    "Grandview Counseling",
  ].filter((line): line is string => line != null);

  if (redirected) {
    body.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: `L&I needs attention: RA ${options.remittanceNumber}`,
    text: body.join("\n"),
  });
}

export async function sendAdminRaNeedsAttentionEmail(options: {
  remittanceNumber: string;
  remittanceAdviceId: string;
  lines: Array<InvoiceAttentionLine & { therapistName: string }>;
}) {
  if (options.lines.length === 0) return;
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const payUrl = `${getSiteUrl()}/portal/admin/pay/${options.remittanceAdviceId}`;
  const deniedCount = options.lines.filter((line) => line.section === "DENIED").length;
  const inProcessCount = options.lines.length - deniedCount;

  await sendEmailTo(adminEmails.join(", "), {
    subject: `L&I needs attention: RA ${options.remittanceNumber}`,
    text: [
      `Remittance ${options.remittanceNumber} was applied with ${options.lines.length} invoice(s) denied or in process.`,
      deniedCount ? `Denied: ${deniedCount}` : null,
      inProcessCount ? `In process: ${inProcessCount}` : null,
      "",
      ...options.lines.map((line) => {
        const dates = line.serviceDates.length ? line.serviceDates.join(", ") : "n/a";
        const eobs = line.eobCodes.length ? ` · EOB ${line.eobCodes.join(", ")}` : "";
        return `- #${line.invoiceNumber} · ${line.claimNumber} · ${line.clientName} · ${line.therapistName} · ${sectionLabel(line.section)} · DOS ${dates}${eobs}`;
      }),
      "",
      "View remittance in the portal:",
      payUrl,
      "",
      "Grandview Counseling",
    ]
      .filter((line): line is string => line != null)
      .join("\n"),
  });
}

export async function sendTherapistPayRunFinalizedEmail(options: {
  therapistEmail: string;
  therapistName: string;
  remittanceNumber: string;
  remittanceAdviceId: string;
  therapistAmount: number;
  lniPaidAmount: number;
  invoices: PayRunFinalizedInvoice[];
  adjustmentNote?: string | null;
  computedTherapistAmount?: number | null;
}) {
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const payUrl = `${getSiteUrl()}/portal/therapist/invoices`;
  const computed = options.computedTherapistAmount;
  const adjusted =
    computed != null && Math.abs(options.therapistAmount - computed) > 0.001;
  const lines = [
    `Hello ${options.therapistName},`,
    "",
    `Your therapist pay for remittance ${options.remittanceNumber} has been finalized.`,
    "",
    `Therapist pay: ${formatCurrency(options.therapistAmount)}`,
    ...(adjusted && computed != null
      ? [`Computed from invoices: ${formatCurrency(computed)}`]
      : []),
    ...(options.adjustmentNote?.trim()
      ? [`Adjustment note: ${options.adjustmentNote.trim()}`]
      : []),
    `L&I paid amount: ${formatCurrency(options.lniPaidAmount)}`,
    `Invoices: ${options.invoices.length}`,
    "",
    ...options.invoices.map(
      (invoice) =>
        `- #${invoice.invoiceNumber} · ${invoice.claimNumber} · ${formatCurrency(invoice.therapistAmount)}`,
    ),
    "",
    "View invoices in the portal:",
    payUrl,
    "",
    "Grandview Counseling",
  ];
  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: `Therapist pay finalized: RA ${options.remittanceNumber}`,
    text: lines.join("\n"),
  });
}

export async function sendAdminUnresolvedRemittanceEmail(options: {
  remittanceNumber: string;
  remittanceAdviceId: string;
  warrantRegister: string;
  unresolvedLines: UnresolvedRemittanceLine[];
}) {
  if (options.unresolvedLines.length === 0) return;
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const payUrl = `${getSiteUrl()}/portal/admin/pay/${options.remittanceAdviceId}`;
  await sendEmailTo(adminEmails.join(", "), {
    subject: `Unresolved RA bills: ${options.remittanceNumber}`,
    text: [
      `Remittance ${options.remittanceNumber} (warrant ${options.warrantRegister}) imported with ${options.unresolvedLines.length} unresolved bill(s).`,
      "",
      ...options.unresolvedLines.map((line) => {
        const patient = line.patientName ? ` · ${line.patientName}` : "";
        const note = line.matchNote ? ` — ${line.matchNote}` : "";
        return `- ${line.claimNumber}${patient} · ${line.section}${note}`;
      }),
      "",
      "Match or supersede these bills before applying:",
      payUrl,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

export async function sendAdminPendingReferralAgingEmail(options: {
  referrals: PendingReferralItem[];
  ageHours: number;
}) {
  if (options.referrals.length === 0) return;
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const clientsUrl = `${getSiteUrl()}/portal/admin/clients`;
  await sendEmailTo(adminEmails.join(", "), {
    subject: `Pending referrals (${options.referrals.length}) older than ${options.ageHours}h`,
    text: [
      `${options.referrals.length} referral(s) have been waiting for therapist acceptance for more than ${options.ageHours} hours.`,
      "",
      ...options.referrals.map((referral) => {
        const since = formatDate(referral.pendingSince);
        return `- ${referral.claimNumber} · ${referral.clientName} · ${referral.therapistName} · since ${since}`;
      }),
      "",
      "Review clients in the portal:",
      clientsUrl,
      "",
      "Grandview Counseling",
    ].join("\n"),
  });
}

export async function sendTherapistPendingReferralAgingEmail(options: {
  therapistEmail: string;
  therapistName: string;
  referrals: PendingReferralItem[];
  ageHours: number;
}) {
  if (options.referrals.length === 0) return;
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const dashboardUrl = `${getSiteUrl()}/portal/therapist/dashboard`;
  const lines = [
    `Hello ${options.therapistName},`,
    "",
    `${options.referrals.length} referral(s) assigned to you have been pending acceptance for more than ${options.ageHours} hours.`,
    "",
    ...options.referrals.map((referral) => {
      const since = formatDate(referral.pendingSince);
      return `- ${referral.claimNumber} · ${referral.clientName} · since ${since}`;
    }),
    "",
    "Review pending referrals in the portal:",
    dashboardUrl,
    "",
    "Grandview Counseling",
  ];
  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: `Pending referrals awaiting acceptance (${options.referrals.length})`,
    text: lines.join("\n"),
  });
}

export async function sendTherapistCutoffReminderEmail(options: {
  therapistEmail: string;
  therapistName: string;
  cutoffDate: Date;
  daysBefore: number;
  draftInvoiceCount: number;
  submittedInvoiceCount: number;
}) {
  const intendedEmail = options.therapistEmail.trim();
  if (!intendedEmail) return;

  const { to, redirected } = await resolveTherapistOutboundEmail(intendedEmail);
  const invoicesUrl = `${getSiteUrl()}/portal/therapist/invoices`;
  const cutoffLabel = formatCalendarIso(calendarIsoFromDate(options.cutoffDate));
  const dayWord = options.daysBefore === 1 ? "day" : "days";

  const lines = [
    `Hello ${options.therapistName},`,
    "",
    `This is a reminder that the L&I billing cutoff date is ${cutoffLabel} (${options.daysBefore} ${dayWord} from now).`,
    "",
    "Please submit your invoices in the portal before 12:00 PM (noon) on that day so they can be included in this pay period.",
    "",
  ];

  if (options.draftInvoiceCount > 0 || options.submittedInvoiceCount > 0) {
    lines.push("Your current invoice status:");
    if (options.draftInvoiceCount > 0) {
      lines.push(
        `- ${options.draftInvoiceCount} draft invoice${options.draftInvoiceCount === 1 ? "" : "s"} (submit before noon on the cutoff date)`,
      );
    }
    if (options.submittedInvoiceCount > 0) {
      lines.push(
        `- ${options.submittedInvoiceCount} submitted invoice${options.submittedInvoiceCount === 1 ? "" : "s"} waiting for admin pay-period assignment`,
      );
    }
    lines.push("");
  }

  lines.push(
    "Open your invoices:",
    invoicesUrl,
    "",
    "Grandview Counseling",
  );

  if (redirected) {
    lines.push(outboundEmailRedirectNote(options.therapistName, intendedEmail));
  }

  await sendEmailTo(to, {
    subject: `Billing cutoff ${cutoffLabel} — submit invoices by noon`,
    text: lines.join("\n"),
  });
}

export type CutoffReminderTherapistSummary = {
  therapistName: string;
  draftInvoiceCount: number;
  submittedInvoiceCount: number;
};

export async function sendAdminCutoffReminderEmail(options: {
  cutoffDate: Date;
  daysBefore: number;
  therapists: CutoffReminderTherapistSummary[];
}) {
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const cutoffLabel = formatCalendarIso(calendarIsoFromDate(options.cutoffDate));
  const dayWord = options.daysBefore === 1 ? "day" : "days";
  const invoicesUrl = `${getSiteUrl()}/portal/admin/invoices?status=SUBMITTED`;
  const billingUrl = `${getSiteUrl()}/portal/admin/billing`;

  const withWork = options.therapists.filter(
    (row) => row.draftInvoiceCount > 0 || row.submittedInvoiceCount > 0,
  );
  const draftTotal = options.therapists.reduce((sum, row) => sum + row.draftInvoiceCount, 0);
  const submittedTotal = options.therapists.reduce(
    (sum, row) => sum + row.submittedInvoiceCount,
    0,
  );

  const lines = [
    `L&I billing cutoff reminder: ${cutoffLabel} is ${options.daysBefore} ${dayWord} away.`,
    "",
    "Therapists were asked to submit invoices before 12:00 PM (noon) on the cutoff date.",
    "",
    `Active therapists notified: ${options.therapists.length}`,
    `Draft invoices across therapists: ${draftTotal}`,
    `Submitted invoices awaiting pay-period assignment: ${submittedTotal}`,
    "",
  ];

  if (withWork.length > 0) {
    lines.push("Therapist invoice status:");
    for (const therapist of withWork) {
      const parts: string[] = [];
      if (therapist.draftInvoiceCount > 0) {
        parts.push(
          `${therapist.draftInvoiceCount} draft${therapist.draftInvoiceCount === 1 ? "" : "s"}`,
        );
      }
      if (therapist.submittedInvoiceCount > 0) {
        parts.push(
          `${therapist.submittedInvoiceCount} submitted`,
        );
      }
      lines.push(`- ${therapist.therapistName}: ${parts.join(", ")}`);
    }
    lines.push("");
  }

  lines.push(
    "Submitted invoices:",
    invoicesUrl,
    "",
    "Bill L&I:",
    billingUrl,
    "",
    "Grandview Counseling",
  );

  await sendEmailTo(adminEmails.join(", "), {
    subject: `Billing cutoff ${cutoffLabel} — therapist reminders sent`,
    text: lines.join("\n"),
  });
}
