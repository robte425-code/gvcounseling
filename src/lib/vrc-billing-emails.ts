import { calendarIsoFromDate, formatDate } from "@/lib/constants";
import { sendEmailTo } from "@/lib/email";
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

export type VrcBillingEmailResult = {
  sent: number;
  skipped: string[];
  errors: string[];
};

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

function buildVrcEmailBody(vrcName: string, serviceDates: Date[]): string {
  const greetingName = vrcFirstName(vrcName);
  const serviceDatePhrase = formatServiceDatesPhrase(serviceDates);
  const { name, phone, email } = VRC_BILLING_EMAIL_SIGNATURE;

  return [
    `Dear ${greetingName},`,
    "",
    `This confirms that a BHI session was conducted with the client on ${serviceDatePhrase}.`,
    "",
    name,
    `M: ${phone}`,
    `E: ${email}`,
  ].join("\n");
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
      lineItems: { select: { serviceDate: true } },
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
      lineItems: Date[];
    }
  >();

  for (const invoice of invoices) {
    const existing = byClient.get(invoice.clientId);
    if (existing) {
      existing.lineItems.push(...invoice.lineItems.map((line) => line.serviceDate));
      continue;
    }
    byClient.set(invoice.clientId, {
      client: invoice.client,
      lineItems: invoice.lineItems.map((line) => line.serviceDate),
    });
  }

  const result: VrcBillingEmailResult = { sent: 0, skipped: [], errors: [] };

  for (const { client, lineItems } of byClient.values()) {
    const label = `${client.lniClaimNumber} (${client.lastName}, ${client.firstName})`;

    if (!client.vrcEmail?.trim()) {
      result.skipped.push(`${label}: no VRC email`);
      continue;
    }

    try {
      const vrcName = client.vrcName?.trim() || "VRC";
      const intendedEmail = client.vrcEmail.trim();
      const { to, redirected } = resolveVrcRecipient(intendedEmail);
      const subject = redirected
        ? `[TEST] BHI session notification — ${client.lniClaimNumber} (for ${vrcFirstName(vrcName)})`
        : `BHI session notification — ${client.lniClaimNumber}`;
      const body = buildVrcEmailBody(vrcName, lineItems);
      const text = redirected
        ? [
            "[TEST MODE — VRC billing emails are redirected]",
            `Intended recipient: ${intendedEmail}`,
            `VRC: ${vrcName}`,
            `Client: ${label}`,
            "",
            body,
          ].join("\n")
        : body;

      await sendEmailTo(to, { subject, text });

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
