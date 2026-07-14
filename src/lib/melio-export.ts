import { sendEmailTo } from "@/lib/email";
import {
  buildMelioBillsCsv,
  buildMelioVendorsCsv,
  defaultMelioDueDate,
  formatMelioDueDate,
  melioInvoiceNumberForPayout,
  melioVendorDisplayName,
  type MelioBillRow,
} from "@/lib/melio";
import { generateMelioTherapistBillPdf } from "@/lib/melio-bill-pdf";
import { getMelioBillsInboxEmail } from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";

export type MelioPayRunExport = {
  remittanceAdviceId: string;
  remittanceNumber: string;
  payRunId: string;
  melioExportedAt: Date | null;
  bills: MelioBillRow[];
  csv: string;
  filename: string;
};

function unpaidAmount(amount: unknown): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function buildMelioExportForRemittance(
  remittanceAdviceId: string,
  dueDate: Date = defaultMelioDueDate(),
): Promise<MelioPayRunExport> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      payRun: {
        include: {
          payouts: {
            include: {
              therapist: {
                select: {
                  firstName: true,
                  lastName: true,
                  melioVendorName: true,
                  email: true,
                },
              },
              lines: {
                include: {
                  invoice: { select: { invoiceNumber: true } },
                },
              },
            },
            orderBy: { therapist: { lastName: "asc" } },
          },
        },
      },
    },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (!remittance.payRun) {
    throw new Error("No therapist pay run for this remittance. Apply the remittance first.");
  }
  if (remittance.payRun.payouts.length === 0) {
    throw new Error("This pay run has no therapist payouts.");
  }

  const due = formatMelioDueDate(dueDate);
  const bills: MelioBillRow[] = [];

  for (const payout of remittance.payRun.payouts) {
    const amount = unpaidAmount(payout.therapistAmount);
    if (amount <= 0) continue;

    const companyName = melioVendorDisplayName(payout.therapist);
    const invoiceNumbers = payout.lines
      .map((line) => `#${line.invoice.invoiceNumber}`)
      .join(", ");

    bills.push({
      companyName,
      amount,
      invoiceNumber: melioInvoiceNumberForPayout({
        remittanceNumber: remittance.remittanceNumber,
        payoutId: payout.id,
      }),
      dueDate: due,
      note: `Therapist pay RA ${remittance.remittanceNumber}; invoices ${invoiceNumbers}`,
    });
  }

  if (bills.length === 0) {
    throw new Error("No positive therapist payout amounts to export to Melio.");
  }

  const safeRem = remittance.remittanceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    remittanceAdviceId: remittance.id,
    remittanceNumber: remittance.remittanceNumber,
    payRunId: remittance.payRun.id,
    melioExportedAt: remittance.payRun.melioExportedAt,
    bills,
    csv: buildMelioBillsCsv(bills),
    filename: `melio-bills-RA-${safeRem}.csv`,
  };
}

export async function markMelioExported(payRunId: string): Promise<void> {
  await prisma.therapistPayRun.update({
    where: { id: payRunId },
    data: { melioExportedAt: new Date() },
  });
}

/**
 * Email one PDF bill per therapist payout to Melio's bill-capture inbox
 * (`your-business@invoicesmelio.com`), then mark the pay run exported.
 */
export async function sendPayRunBillsToMelioInbox(remittanceAdviceId: string): Promise<{
  sentCount: number;
  inboxEmail: string;
  bills: MelioBillRow[];
}> {
  const inboxEmail = await getMelioBillsInboxEmail();
  if (!inboxEmail) {
    throw new Error(
      "Set your Melio bills inbox email first (Admin → Melio settings). It looks like name@invoicesmelio.com.",
    );
  }

  const exportData = await buildMelioExportForRemittance(remittanceAdviceId);
  const remittance = await prisma.remittanceAdvice.findUniqueOrThrow({
    where: { id: remittanceAdviceId },
    include: {
      payRun: {
        include: {
          payouts: {
            include: {
              therapist: {
                select: { firstName: true, lastName: true, melioVendorName: true },
              },
              lines: {
                include: { invoice: { select: { invoiceNumber: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!remittance.payRun) throw new Error("No therapist pay run found.");

  let sentCount = 0;
  for (const payout of remittance.payRun.payouts) {
    const amount = unpaidAmount(payout.therapistAmount);
    if (amount <= 0) continue;

    const bill = exportData.bills.find(
      (row) =>
        row.invoiceNumber ===
        melioInvoiceNumberForPayout({
          remittanceNumber: remittance.remittanceNumber,
          payoutId: payout.id,
        }),
    );
    if (!bill) continue;

    const therapistName = `${payout.therapist.firstName} ${payout.therapist.lastName}`.trim();
    const pdfBytes = await generateMelioTherapistBillPdf({
      bill,
      remittanceNumber: remittance.remittanceNumber,
      therapistName,
      lineItems: payout.lines.map((line) => ({
        description: `Invoice #${line.invoice.invoiceNumber}`,
        amount: unpaidAmount(line.therapistAmount),
      })),
    });

    await sendEmailTo(inboxEmail, {
      subject: `Invoice ${bill.invoiceNumber} — ${bill.companyName} — $${bill.amount.toFixed(2)}`,
      text: [
        `Vendor: ${bill.companyName}`,
        `Invoice #: ${bill.invoiceNumber}`,
        `Amount: $${bill.amount.toFixed(2)}`,
        `Due date: ${bill.dueDate}`,
        `L&I remittance: ${remittance.remittanceNumber}`,
        "",
        "Bill PDF attached for Melio capture.",
      ].join("\n"),
      attachments: [
        {
          filename: `${bill.invoiceNumber}.pdf`,
          content: Buffer.from(pdfBytes).toString("base64"),
          contentType: "application/pdf",
        },
      ],
    });
    sentCount += 1;
  }

  if (sentCount === 0) {
    throw new Error("No bills were sent to Melio.");
  }

  await markMelioExported(exportData.payRunId);
  return { sentCount, inboxEmail, bills: exportData.bills };
}

export async function buildMelioVendorsExport(): Promise<{ csv: string; filename: string }> {
  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST", active: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      firstName: true,
      lastName: true,
      email: true,
      melioVendorName: true,
    },
  });

  const csv = buildMelioVendorsCsv(
    therapists.map((t) => ({
      companyName: melioVendorDisplayName(t),
      email: t.email,
    })),
  );
  return { csv, filename: "melio-vendors-therapists.csv" };
}
