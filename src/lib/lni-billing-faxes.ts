import { calendarIsoFromDate, formatDate } from "@/lib/constants";
import { sendFax } from "@/lib/faxage";
import {
  downloadFileBuffer,
  getDriveFileMeta,
  parseDriveFileIdFromUrl,
} from "@/lib/google-drive";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { generateLniFaxCoverPdf } from "@/lib/lni-fax-cover";
import {
  LNI_FAX_PRODUCTION,
  LNI_FAX_TEST,
  type LniFaxDestination,
} from "@/lib/lni-fax-constants";
import { getLniOutboundFaxRoute } from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";
import { sendAdminLniFaxNotificationEmail } from "@/lib/referral-emails";

export {
  defaultLniFaxDestination,
  getLniFaxTestNumber,
  LNI_FAX_PRODUCTION,
  LNI_FAX_TEST,
  LNI_FAX_TEST_FORMATTED,
  parseLniFaxDestinationParam,
  type LniFaxDestination,
} from "@/lib/lni-fax-constants";

type FaxFile = {
  filename: string;
  dataBase64: string;
};

type InvoiceAttachmentRecord = {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
};

export type LniBillingFaxResult = {
  sent: number;
  skipped: string[];
  errors: string[];
};

function isSessionAttachment(filename: string): boolean {
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

function collectSessionAttachments(
  attachments: InvoiceAttachmentRecord[],
): InvoiceAttachmentRecord[] {
  const seen = new Set<string>();
  const eligible: InvoiceAttachmentRecord[] = [];

  for (const attachment of attachments) {
    if (!isSessionAttachment(attachment.filename)) continue;
    if (seen.has(attachment.id)) continue;
    seen.add(attachment.id);
    eligible.push(attachment);
  }

  return eligible;
}

async function loadAttachmentForFax(
  accessToken: string,
  attachment: InvoiceAttachmentRecord,
): Promise<FaxFile> {
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
    dataBase64: buffer.toString("base64"),
  };
}

function resolveFaxNumber(
  intendedFax: string,
  destination: LniFaxDestination,
): { faxno: string; redirected: boolean } {
  if (destination === "lni") {
    return { faxno: intendedFax, redirected: false };
  }
  return { faxno: LNI_FAX_TEST, redirected: true };
}

async function buildFaxFiles(
  accessToken: string,
  options: {
    claimNumber: string;
    clientName: string;
    providerName: string;
    serviceDates: Date[];
    sessionAttachments: InvoiceAttachmentRecord[];
  },
): Promise<FaxFile[]> {
  const coverPdf = await generateLniFaxCoverPdf({
    claimNumber: options.claimNumber,
    clientName: options.clientName,
    providerName: options.providerName,
    serviceDatesPhrase: formatServiceDatesPhrase(options.serviceDates),
  });

  const files: FaxFile[] = [
    {
      filename: `cover-${options.claimNumber.replace(/\W/g, "")}.pdf`,
      dataBase64: Buffer.from(coverPdf).toString("base64"),
    },
  ];

  for (const attachment of options.sessionAttachments) {
    files.push(await loadAttachmentForFax(accessToken, attachment));
  }

  return files;
}

export async function faxLniForPayPeriod(options: {
  payPeriodId: string;
  initiatorUserId: string;
}): Promise<LniBillingFaxResult> {
  const lniFaxDestination = await getLniOutboundFaxRoute();
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
          employerName: true,
          selfInsured: true,
          employerFax: true,
        },
      },
      therapist: { select: { id: true, firstName: true, lastName: true } },
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
      therapist: (typeof invoices)[number]["therapist"];
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
      therapist: invoice.therapist,
      therapistId: invoice.therapistId,
      lineItems: invoice.lineItems.map((line) => line.serviceDate),
      attachments: [...invoice.attachments],
    });
  }

  const result: LniBillingFaxResult = { sent: 0, skipped: [], errors: [] };

  for (const { client, therapist, therapistId, lineItems, attachments } of byClient.values()) {
    const label = `${client.lniClaimNumber} (${client.lastName}, ${client.firstName})`;
    const clientName = `${client.lastName}, ${client.firstName}`;
    const providerName = `${therapist.firstName} ${therapist.lastName}`.trim() || "Provider";

    const sessionAttachments = collectSessionAttachments(attachments);
    if (sessionAttachments.length === 0) {
      result.skipped.push(`${label}: no session files (invoice PDFs are not faxed to L&I)`);
      continue;
    }

    try {
      const accessToken = await getDriveAccessTokenForClient({
        therapistId,
        initiatorUserId: options.initiatorUserId,
      });

      const faxFiles = await buildFaxFiles(accessToken, {
        claimNumber: client.lniClaimNumber,
        clientName,
        providerName,
        serviceDates: lineItems,
        sessionAttachments,
      });

      const filenames = faxFiles.map((f) => f.filename);
      const fileDataBase64 = faxFiles.map((f) => f.dataBase64);

      const { faxno: lniFaxno, redirected: lniRedirected } = resolveFaxNumber(
        LNI_FAX_PRODUCTION,
        lniFaxDestination,
      );
      const lniRecipname = lniRedirected
        ? `[TEST] L&I — ${client.lniClaimNumber}`
        : "Washington State L&I";

      const lniSend = await sendFax({
        faxno: lniFaxno,
        recipname: lniRecipname,
        filenames,
        fileDataBase64,
      });
      result.sent += 1;

      try {
        await sendAdminLniFaxNotificationEmail({
          clientId: client.id,
          clientName,
          claimNumber: client.lniClaimNumber,
          sentBy: "Pay period L&I fax",
          faxJobId: lniSend.jobId,
          destinationLabel: lniRedirected
            ? `test fax line (${lniFaxno})`
            : `L&I (${lniFaxno})`,
          filenames,
        });
      } catch (error) {
        console.error("Admin L&I fax notification email failed:", error);
      }

      if (client.selfInsured) {
        const employerFax = client.employerFax?.trim();
        if (!employerFax) {
          result.skipped.push(`${label}: self-insured but no employer fax on file`);
        } else {
          const employerName = client.employerName?.trim() || "Self-insured employer";
          const { faxno: employerFaxno, redirected: employerRedirected } = resolveFaxNumber(
            employerFax,
            lniFaxDestination,
          );
          const employerRecipname = employerRedirected
            ? `[TEST] Employer copy — ${employerName} (${client.lniClaimNumber})`
            : employerName;

          await sendFax({
            faxno: employerFaxno,
            recipname: employerRecipname,
            filenames,
            fileDataBase64,
          });
          result.sent += 1;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`${label}: ${message}`);
    }
  }

  if (result.sent === 0 && result.errors.length === 0 && result.skipped.length === 0) {
    throw new Error("No L&I faxes were sent.");
  }

  return result;
}
