import { calendarIsoFromDate, formatDate } from "@/lib/constants";
import { sendEmailTo } from "@/lib/email";
import {
  downloadFileBuffer,
  getDriveFileMeta,
  parseDriveFileIdFromUrl,
} from "@/lib/google-drive";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { prisma } from "@/lib/prisma";

export const VRC_BILLING_EMAIL_SIGNATURE = {
  name: "Ghim-Sim Chua",
  phone: "206-335-6585",
  email: "ghim@gvcounseling.com",
} as const;

/** When set, all VRC billing emails are sent here instead of the VRC address. */
export function getVrcEmailRedirectTo(): string | null {
  const value = process.env.VRC_EMAIL_REDIRECT_TO?.trim();
  return value || null;
}

function resolveVrcRecipient(intendedEmail: string): {
  to: string;
  redirected: boolean;
} {
  const redirect = getVrcEmailRedirectTo();
  if (!redirect) {
    return { to: intendedEmail, redirected: false };
  }
  return { to: redirect, redirected: true };
}

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
  skipped: string[];
  errors: string[];
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

function vrcFirstName(vrcName: string): string {
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

function buildVrcEmailBody(vrcName: string, serviceDates: Date[], hasAttachments: boolean): string {
  const greetingName = vrcFirstName(vrcName);
  const serviceDatePhrase = formatServiceDatesPhrase(serviceDates);
  const { name, phone, email } = VRC_BILLING_EMAIL_SIGNATURE;
  const sessionLine = hasAttachments
    ? `Please find attached documentation of the BHI session conducted with the client on ${serviceDatePhrase}.`
    : `This confirms that a BHI session was conducted with the client on ${serviceDatePhrase}.`;

  return [
    `Dear ${greetingName},`,
    "",
    sessionLine,
    "",
    name,
    `M: ${phone}`,
    `E: ${email}`,
  ].join("\n");
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

  const result: VrcBillingEmailResult = { sent: 0, skipped: [], errors: [] };

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
      const { to, redirected } = resolveVrcRecipient(intendedEmail);
      const subject = redirected
        ? `[TEST] BHI session notification — ${client.lniClaimNumber} (for ${vrcFirstName(vrcName)})`
        : `BHI session notification — ${client.lniClaimNumber}`;
      const body = buildVrcEmailBody(vrcName, lineItems, true);
      const text = redirected
        ? [
            "[TEST MODE — VRC billing emails are redirected]",
            `Intended recipient: ${intendedEmail}`,
            `VRC: ${vrcName}`,
            `Client: ${label}`,
            `Attachments: ${vrcAttachments.map((a) => a.filename).join(", ")}`,
            "",
            body,
          ].join("\n")
        : body;

      await sendEmailTo(to, {
        subject,
        text,
        attachments: emailAttachments,
      });

      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`${label}: ${message}`);
    }
  }

  if (result.sent === 0 && result.errors.length === 0 && result.skipped.length === 0) {
    throw new Error("No VRC emails were sent.");
  }

  return result;
}
