import { calendarIsoFromDate } from "@/lib/constants";
import { normalizeLniProviderId } from "@/lib/parse-lni-remittance-pdf";
import {
  sendAdminRaNeedsAttentionEmail,
  sendAdminUnresolvedRemittanceEmail,
  sendTherapistPayRunFinalizedEmail,
  type InvoiceAttentionLine,
  type PayRunUnpaidBill,
} from "@/lib/portal-workflow-emails";
import { prisma } from "@/lib/prisma";

type ServiceLineJson = { serviceDateFrom?: string };

const PLACEHOLDER_SERVICE_DATE = "1970-01-01";

function serviceDatesFromLine(serviceLines: unknown): string[] {
  if (!Array.isArray(serviceLines)) return [];
  const dates = new Set<string>();
  for (const line of serviceLines as ServiceLineJson[]) {
    const date = line?.serviceDateFrom?.trim();
    if (date && date !== PLACEHOLDER_SERVICE_DATE) dates.add(date);
  }
  return [...dates].sort();
}

export async function notifyUnresolvedRemittanceIfNeeded(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      lines: {
        select: {
          claimNumber: true,
          patientName: true,
          section: true,
          matchNote: true,
          matchedInvoiceId: true,
          supersededAt: true,
        },
      },
    },
  });
  if (!remittance || remittance.status !== "PREVIEW") return;

  const unresolvedLines = remittance.lines
    .filter((line) => !line.matchedInvoiceId && !line.supersededAt)
    .map((line) => ({
      claimNumber: line.claimNumber,
      patientName: line.patientName ?? "",
      section: line.section,
      matchNote: line.matchNote,
    }));

  if (unresolvedLines.length === 0) return;

  try {
    await sendAdminUnresolvedRemittanceEmail({
      remittanceNumber: remittance.remittanceNumber,
      remittanceAdviceId: remittance.id,
      warrantRegister: remittance.warrantRegister,
      unresolvedLines,
    });
  } catch (error) {
    console.error("Unresolved remittance notification email failed:", error);
  }
}

/** Admin-only: denied / in-process invoices after apply. Therapists are not emailed here. */
export async function notifyRaNeedsAttentionAfterApply(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      lines: {
        where: {
          supersededAt: null,
          section: { in: ["DENIED", "IN_PROCESS"] },
          matchedInvoiceId: { not: null },
        },
        include: {
          matchedInvoice: {
            select: {
              invoiceNumber: true,
              therapist: {
                select: { id: true, firstName: true, lastName: true },
              },
              client: {
                select: { firstName: true, lastName: true, lniClaimNumber: true },
              },
              lineItems: { select: { serviceDate: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!remittance) return;

  const attention = remittance.lines.flatMap((line) => {
    const invoice = line.matchedInvoice;
    if (!invoice) return [];
    const item: InvoiceAttentionLine & { therapistName: string } = {
      invoiceNumber: invoice.invoiceNumber,
      claimNumber: invoice.client.lniClaimNumber,
      clientName: `${invoice.client.lastName}, ${invoice.client.firstName}`,
      section: line.section as "DENIED" | "IN_PROCESS",
      serviceDates:
        invoice.lineItems.length > 0
          ? invoice.lineItems.map((item) => calendarIsoFromDate(item.serviceDate))
          : serviceDatesFromLine(line.serviceLines),
      eobCodes: line.eobCodes,
      therapistName: `${invoice.therapist.firstName} ${invoice.therapist.lastName}`.trim(),
    };
    return [item];
  });

  if (attention.length === 0) return;

  try {
    await sendAdminRaNeedsAttentionEmail({
      remittanceNumber: remittance.remittanceNumber,
      remittanceAdviceId: remittance.id,
      lines: attention,
    });
  } catch (error) {
    console.error("Admin RA needs-attention email failed:", error);
  }
}

function clientNameFromLine(line: {
  patientName: string | null;
  matchedInvoice: {
    client: { firstName: string; lastName: string };
  } | null;
}): string {
  if (line.matchedInvoice?.client) {
    const { firstName, lastName } = line.matchedInvoice.client;
    return `${lastName}, ${firstName}`;
  }
  return line.patientName?.trim() || "Unknown client";
}

export async function finalizeTherapistPayRun(
  remittanceAdviceId: string,
  options?: { notifyTherapists?: boolean },
): Promise<void> {
  const notifyTherapists = options?.notifyTherapists === true;

  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      lines: {
        where: { supersededAt: null },
        include: {
          matchedInvoice: {
            select: {
              invoiceNumber: true,
              therapistId: true,
              therapist: { select: { id: true, lniProviderId: true } },
              client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
              lineItems: {
                select: { serviceDate: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
      payRun: {
        include: {
          payouts: {
            include: {
              therapist: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  lniProviderId: true,
                },
              },
              lines: {
                include: {
                  invoice: {
                    select: {
                      invoiceNumber: true,
                      client: { select: { lniClaimNumber: true } },
                      lineItems: {
                        select: { serviceDate: true },
                        orderBy: { sortOrder: "asc" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "APPLIED") {
    throw new Error("Only applied remittances can finalize therapist pay.");
  }
  if (!remittance.payRun) throw new Error("No therapist pay run found for this remittance.");
  if (remittance.payRun.status === "FINALIZED") {
    throw new Error("This therapist pay run is already finalized.");
  }

  await prisma.therapistPayRun.update({
    where: { id: remittance.payRun.id },
    data: {
      status: "FINALIZED",
      finalizedAt: new Date(),
    },
  });

  if (!notifyTherapists) return;

  const unpaidByTherapistId = new Map<string, PayRunUnpaidBill[]>();

  for (const line of remittance.lines) {
    if (line.section === "PAID") continue;

    const matchedTherapistId = line.matchedInvoice?.therapistId ?? null;
    const providerId = line.serviceProviderId
      ? normalizeLniProviderId(line.serviceProviderId)
      : "";

    const serviceDates =
      line.matchedInvoice && line.matchedInvoice.lineItems.length > 0
        ? [
            ...new Set(
              line.matchedInvoice.lineItems.map((item) => calendarIsoFromDate(item.serviceDate)),
            ),
          ].sort()
        : serviceDatesFromLine(line.serviceLines);

    const unpaid: PayRunUnpaidBill = {
      claimNumber: line.claimNumber,
      clientName: clientNameFromLine(line),
      section: line.section,
      invoiceNumber: line.matchedInvoice?.invoiceNumber ?? null,
      serviceDates,
      eobCodes: line.eobCodes,
      billTotalPayable: Number(line.billTotalPayable),
    };

    const therapistIds = new Set<string>();
    if (matchedTherapistId) therapistIds.add(matchedTherapistId);
    if (providerId) {
      for (const payout of remittance.payRun.payouts) {
        const therapistProvider = payout.therapist.lniProviderId
          ? normalizeLniProviderId(payout.therapist.lniProviderId)
          : "";
        if (therapistProvider && therapistProvider === providerId) {
          therapistIds.add(payout.therapist.id);
        }
      }
    }

    // If still unassigned but there is exactly one payout therapist on this RA, attach there.
    if (therapistIds.size === 0 && remittance.payRun.payouts.length === 1) {
      therapistIds.add(remittance.payRun.payouts[0]!.therapist.id);
    }

    for (const therapistId of therapistIds) {
      const list = unpaidByTherapistId.get(therapistId) ?? [];
      list.push(unpaid);
      unpaidByTherapistId.set(therapistId, list);
    }
  }

  for (const payout of remittance.payRun.payouts) {
    try {
      await sendTherapistPayRunFinalizedEmail({
        therapistEmail: payout.therapist.email,
        therapistName: `${payout.therapist.firstName} ${payout.therapist.lastName}`.trim(),
        remittanceNumber: remittance.remittanceNumber,
        remittanceAdviceId: remittance.id,
        therapistAmount: Number(payout.therapistAmount),
        computedTherapistAmount: Number(payout.computedTherapistAmount),
        adjustmentNote: payout.adjustmentNote,
        lniPaidAmount: Number(payout.lniPaidAmount),
        invoices: payout.lines.map((line) => ({
          invoiceNumber: line.invoice.invoiceNumber,
          claimNumber: line.invoice.client.lniClaimNumber,
          therapistAmount: Number(line.therapistAmount),
          serviceDates: [
            ...new Set(
              line.invoice.lineItems.map((item) => calendarIsoFromDate(item.serviceDate)),
            ),
          ].sort(),
        })),
        unpaidBills: unpaidByTherapistId.get(payout.therapist.id) ?? [],
      });
    } catch (error) {
      console.error("Therapist pay-run finalized email failed:", error);
    }
  }
}
