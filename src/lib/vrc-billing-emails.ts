import { calendarIsoFromDate, formatDate } from "@/lib/constants";
import { sendEmailTo } from "@/lib/email";
import {
  downloadFileBuffer,
  getDriveFileMeta,
  parseDriveFileIdFromUrl,
} from "@/lib/google-drive";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import {
  outboundEmailRedirectNote,
  resolveAdminCcForVrcEmail,
  resolveVrcOutboundEmail,
} from "@/lib/outbound-email-routing";
import { getAdminNotificationEmails } from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";

export const VRC_BILLING_EMAIL_SIGNATURE = {
  name: "Ghim-Sim Chua",
  phone: "206-335-6585",
  email: "ghim@gvcounseling.com",
} as const;

type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

type InvoiceAttachmentRecord = {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
};

export type VrcBillingEmailResult = {
  sent: number;
  /** Human-readable lines like "BL41649 → jane@vrc.com (admin CC'd)". */
  sentDetails: string[];
  skipped: string[];
  errors: string[];
  /** Admin addresses that should have been CC'd (empty when mail was redirected to admin). */
  adminCc: string[];
};

/** Session/supporting files for VRC email — excludes invoice PDFs. */
function isVrcEmailAttachment(filename: string): boolean {
  return !/invoice/i.test(filename);
}

function formatServiceDatesPhrase(dates: Date[]): string {
  const unique = [...new Set(dates.map((d) => calendarIsoFromDate(d)))].sort();
  const formatted = unique.map((iso) => formatDate(iso));
  if (formatted.length === 0) return "the recent service date";
  if (formatted.length === 1) return formatted[0]!;
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]}`;
}

export function vrcFirstName(vrcName: string): string {
  const trimmed = vrcName.trim();
  if (!trimmed) return "VRC";

  const withoutSuffix = trimmed.replace(/\s+VRC\b/i, "").trim();
  const first = (withoutSuffix || trimmed).split(/\s+/)[0] ?? "";
  if (!first) return "VRC";

  if (first === first.toUpperCase() && first.length > 1) {
    return first.charAt(0) + first.slice(1).toLowerCase();
  }

  return first;
}

const REFER_CLIENT_URL = "https://gvcounseling.com/refer-a-client";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildVrcEmailBody(
  vrcName: string,
  serviceDates: Date[],
  hasAttachments: boolean,
): { text: string; html: string } {
  const greetingName = vrcFirstName(vrcName);
  const serviceDatePhrase = formatServiceDatesPhrase(serviceDates);
  const { name, phone, email } = VRC_BILLING_EMAIL_SIGNATURE;
  const sessionLine = hasAttachments
    ? `Please find attached documentation of the BHI session conducted with the client on ${serviceDatePhrase}.`
    : `This confirms that a BHI session was conducted with the client on ${serviceDatePhrase}.`;
  const referLineText = `Have a client who needs BHI therapy? Click here to refer your client! ${REFER_CLIENT_URL}`;
  const referLineHtml = `Have a client who needs BHI therapy? <a href="${REFER_CLIENT_URL}">Click here to refer your client!</a>`;

  const text = [
    `Dear ${greetingName},`,
    "",
    sessionLine,
    "",
    referLineText,
    "",
    name,
    `M: ${phone}`,
    `E: ${email}`,
  ].join("\n");

  const html = [
    `Dear ${escapeHtml(greetingName)},`,
    "",
    escapeHtml(sessionLine),
    "",
    referLineHtml,
    "",
    escapeHtml(name),
    escapeHtml(`M: ${phone}`),
    escapeHtml(`E: ${email}`),
  ].join("<br>\n");

  return { text, html };
}

async function loadAttachmentForEmail(
  accessToken: string,
  attachment: InvoiceAttachmentRecord,
): Promise<EmailAttachment> {
  const fileId = parseDriveFileIdFromUrl(attachment.blobUrl);
  if (!fileId) {
    throw new Error(`Could not read Google Drive file link for ${attachment.filename}.`);
  }

  const meta = await getDriveFileMeta(accessToken, fileId);
  const buffer = await downloadFileBuffer(accessToken, {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
  });

  return {
    filename: attachment.filename,
    content: buffer.toString("base64"),
    contentType: attachment.contentType || meta.mimeType,
  };
}

function collectVrcAttachments(
  attachments: InvoiceAttachmentRecord[],
): InvoiceAttachmentRecord[] {
  const seen = new Set<string>();
  const eligible: InvoiceAttachmentRecord[] = [];

  for (const attachment of attachments) {
    if (!isVrcEmailAttachment(attachment.filename)) continue;
    if (seen.has(attachment.id)) continue;
    seen.add(attachment.id);
    eligible.push(attachment);
  }

  return eligible;
}

export async function emailVrcsForPayPeriod(options: {
  payPeriodId: string;
  initiatorUserId: string;
}): Promise<VrcBillingEmailResult> {
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: options.payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found.");

  const invoices = await prisma.invoice.findMany({
    where: {
      payPeriodId: options.payPeriodId,
      status: "BILLED",
    },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          lniClaimNumber: true,
          vrcName: true,
          vrcEmail: true,
        },
      },
      therapist: { select: { id: true } },
      lineItems: { select: { serviceDate: true } },
      attachments: true,
    },
    orderBy: [{ client: { lastName: "asc" } }, { invoiceNumber: "asc" }],
  });

  if (!invoices.length) {
    throw new Error("No billed invoices in this pay period.");
  }

  const byClient = new Map<
    string,
    {
      client: (typeof invoices)[number]["client"];
      therapistId: string;
      lineItems: Date[];
      attachments: InvoiceAttachmentRecord[];
    }
  >();

  for (const invoice of invoices) {
    const existing = byClient.get(invoice.clientId);
    if (existing) {
      existing.lineItems.push(...invoice.lineItems.map((line) => line.serviceDate));
      existing.attachments.push(...invoice.attachments);
      continue;
    }
    byClient.set(invoice.clientId, {
      client: invoice.client,
      therapistId: invoice.therapistId,
      lineItems: invoice.lineItems.map((line) => line.serviceDate),
      attachments: [...invoice.attachments],
    });
  }

  const result: VrcBillingEmailResult = {
    sent: 0,
    sentDetails: [],
    skipped: [],
    errors: [],
    adminCc: [],
  };

  for (const { client, therapistId, lineItems, attachments } of byClient.values()) {
    const label = `${client.lniClaimNumber} (${client.lastName}, ${client.firstName})`;

    if (!client.vrcEmail?.trim()) {
      result.skipped.push(`${label}: no VRC email`);
      continue;
    }

    const vrcAttachments = collectVrcAttachments(attachments);
    if (vrcAttachments.length === 0) {
      result.skipped.push(`${label}: no session files (invoice PDFs are not emailed to VRCs)`);
      continue;
    }

    try {
      const accessToken = await getDriveAccessTokenForClient({
        therapistId,
        initiatorUserId: options.initiatorUserId,
      });

      const emailAttachments: EmailAttachment[] = [];
      for (const attachment of vrcAttachments) {
        emailAttachments.push(await loadAttachmentForEmail(accessToken, attachment));
      }

      const vrcName = client.vrcName?.trim() || "VRC";
      const intendedEmail = client.vrcEmail.trim();
      const { to, redirected } = await resolveVrcOutboundEmail(intendedEmail);
      const greetingName = vrcFirstName(vrcName);
      const subject = `BHI session notification — ${client.lniClaimNumber}`;
      const { text: bodyText, html: bodyHtml } = buildVrcEmailBody(greetingName, lineItems, true);
      const redirectNote = redirected ? outboundEmailRedirectNote(vrcName, intendedEmail) : null;
      const text = redirectNote
        ? [
            bodyText,
            redirectNote,
            "",
            `Client: ${label}`,
            `Attachments: ${vrcAttachments.map((a) => a.filename).join(", ")}`,
          ].join("\n")
        : bodyText;
      const html = redirectNote
        ? [
            bodyHtml,
            escapeHtml(redirectNote),
            "",
            escapeHtml(`Client: ${label}`),
            escapeHtml(`Attachments: ${vrcAttachments.map((a) => a.filename).join(", ")}`),
          ].join("<br>\n")
        : bodyHtml;

      // Always CC admin(s) when the message is not already addressed only to them.
      const cc = await resolveAdminCcForVrcEmail(to);
      if (cc) {
        result.adminCc = cc.split(",").map((email) => email.trim()).filter(Boolean);
      }

      await sendEmailTo(to, {
        subject,
        text,
        html,
        cc,
        attachments: emailAttachments,
      });

      result.sent += 1;
      const delivery = redirected
        ? `${label} → admin inbox (intended ${intendedEmail})`
        : `${label} → ${intendedEmail}${cc ? ` (admin CC: ${cc})` : ""}`;
      result.sentDetails.push(delivery);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`${label}: ${message}`);
    }
  }

  if (result.sent === 0 && result.errors.length === 0 && result.skipped.length === 0) {
    throw new Error("No VRC emails were sent.");
  }

  await sendVrcEmailBatchSummary(result, options.payPeriodId);

  return result;
}

async function sendVrcEmailBatchSummary(
  result: VrcBillingEmailResult,
  payPeriodId: string,
): Promise<void> {
  const adminEmails = await getAdminNotificationEmails();
  if (adminEmails.length === 0) return;

  const payPeriod = await prisma.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: { label: true, cutoffDate: true },
  });
  const periodLabel =
    payPeriod?.label?.trim() ||
    (payPeriod ? formatDate(payPeriod.cutoffDate) : payPeriodId);

  const lines = [
    `VRC email batch for pay period ${periodLabel}`,
    "",
    `Sent: ${result.sent}`,
    `Skipped: ${result.skipped.length}`,
    `Errors: ${result.errors.length}`,
    "",
  ];

  if (result.adminCc.length) {
    lines.push(`Admin CC on each VRC email: ${result.adminCc.join(", ")}`);
    lines.push("");
  } else if (result.sent > 0) {
    lines.push(
      "Admin was the To recipient (VRC outbound route is set to admin), so there was no separate CC.",
    );
    lines.push("");
  }

  if (result.sentDetails.length) {
    lines.push("Sent:");
    for (const detail of result.sentDetails) lines.push(`  • ${detail}`);
    lines.push("");
  }
  if (result.skipped.length) {
    lines.push("Skipped:");
    for (const row of result.skipped) lines.push(`  • ${row}`);
    lines.push("");
  }
  if (result.errors.length) {
    lines.push("Errors:");
    for (const row of result.errors) lines.push(`  • ${row}`);
    lines.push("");
  }

  lines.push("You can also see this summary at the top of Bill L&I after Email VRCs runs.");

  try {
    await sendEmailTo(adminEmails.join(", "), {
      subject: `[GV Counseling] VRC email results — ${result.sent} sent (${periodLabel})`,
      text: lines.join("\n"),
    });
  } catch (error) {
    console.error("VRC email batch summary failed:", error);
  }
}
