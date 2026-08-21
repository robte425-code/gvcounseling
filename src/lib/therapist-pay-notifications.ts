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

type TherapistContact = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lniProviderId: string | null;
};

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
              therapist: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  lniProviderId: true,
                },
              },
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

  // Conditional on the status, so two concurrent submits cannot both pass the
  // check above and both go on to email every therapist their payout summary —
  // and those emails are what prompt the wire, so a duplicate invites a duplicate
  // payment. The second writer updates zero rows and stops here.
  const finalized = await prisma.therapistPayRun.updateMany({
    where: { id: remittance.payRun.id, status: "DRAFT" },
    data: {
      status: "FINALIZED",
      finalizedAt: new Date(),
    },
  });
  if (finalized.count === 0) {
    throw new Error("This therapist pay run is already finalized.");
  }

  if (!notifyTherapists) return;

  const unpaidByTherapistId = new Map<string, PayRunUnpaidBill[]>();
  const therapistContacts = new Map<string, TherapistContact>();

  for (const payout of remittance.payRun.payouts) {
    therapistContacts.set(payout.therapist.id, payout.therapist);
  }

  for (const line of remittance.lines) {
    if (line.section === "PAID") continue;

    const matchedTherapist = line.matchedInvoice?.therapist ?? null;
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

    // Prefer matched invoice therapist exclusively; otherwise provider-id match among
    // therapists already on this remittance (payout or other matched unpaid). Never
    // fall back to "the only payout therapist".
    let therapistId: string | null = null;
    if (matchedTherapist) {
      therapistId = matchedTherapist.id;
      therapistContacts.set(matchedTherapist.id, matchedTherapist);
    } else if (providerId) {
      for (const therapist of therapistContacts.values()) {
        const therapistProvider = therapist.lniProviderId
          ? normalizeLniProviderId(therapist.lniProviderId)
          : "";
        if (therapistProvider && therapistProvider === providerId) {
          therapistId = therapist.id;
          break;
        }
      }
    }

    if (!therapistId) continue;

    const list = unpaidByTherapistId.get(therapistId) ?? [];
    list.push(unpaid);
    unpaidByTherapistId.set(therapistId, list);
  }

  const emailedTherapistIds = new Set<string>();

  for (const payout of remittance.payRun.payouts) {
    emailedTherapistIds.add(payout.therapist.id);
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

  // Therapists with only unpaid/denied/in-process matched bills (no paid payout) still get a summary.
  for (const [therapistId, unpaidBills] of unpaidByTherapistId) {
    if (emailedTherapistIds.has(therapistId) || unpaidBills.length === 0) continue;
    const therapist = therapistContacts.get(therapistId);
    if (!therapist?.email) continue;
    try {
      await sendTherapistPayRunFinalizedEmail({
        therapistEmail: therapist.email,
        therapistName: `${therapist.firstName} ${therapist.lastName}`.trim(),
        remittanceNumber: remittance.remittanceNumber,
        remittanceAdviceId: remittance.id,
        therapistAmount: 0,
        computedTherapistAmount: 0,
        lniPaidAmount: 0,
        invoices: [],
        unpaidBills,
      });
    } catch (error) {
      console.error("Therapist unpaid-only remittance summary email failed:", error);
    }
  }
}
