import { calendarIsoFromDate } from "@/lib/constants";
import {
  sendAdminRaNeedsAttentionEmail,
  sendAdminUnresolvedRemittanceEmail,
  sendTherapistPayRunFinalizedEmail,
  sendTherapistRaNeedsAttentionEmail,
  type InvoiceAttentionLine,
} from "@/lib/portal-workflow-emails";
import { prisma } from "@/lib/prisma";

type ServiceLineJson = { serviceDateFrom?: string };

function serviceDatesFromLine(serviceLines: unknown): string[] {
  if (!Array.isArray(serviceLines)) return [];
  const dates = new Set<string>();
  for (const line of serviceLines as ServiceLineJson[]) {
    if (line?.serviceDateFrom) dates.add(line.serviceDateFrom);
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
                select: { id: true, email: true, firstName: true, lastName: true },
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
    const item: InvoiceAttentionLine & {
      therapistId: string;
      therapistEmail: string;
      therapistName: string;
    } = {
      invoiceNumber: invoice.invoiceNumber,
      claimNumber: invoice.client.lniClaimNumber,
      clientName: `${invoice.client.lastName}, ${invoice.client.firstName}`,
      section: line.section as "DENIED" | "IN_PROCESS",
      serviceDates:
        invoice.lineItems.length > 0
          ? invoice.lineItems.map((item) => calendarIsoFromDate(item.serviceDate))
          : serviceDatesFromLine(line.serviceLines),
      eobCodes: line.eobCodes,
      therapistId: invoice.therapist.id,
      therapistEmail: invoice.therapist.email,
      therapistName: `${invoice.therapist.firstName} ${invoice.therapist.lastName}`.trim(),
    };
    return [item];
  });

  if (attention.length === 0) return;

  try {
    await sendAdminRaNeedsAttentionEmail({
      remittanceNumber: remittance.remittanceNumber,
      remittanceAdviceId: remittance.id,
      lines: attention.map(({ therapistId: _id, therapistEmail: _email, ...rest }) => rest),
    });
  } catch (error) {
    console.error("Admin RA needs-attention email failed:", error);
  }

  const byTherapist = new Map<
    string,
    {
      email: string;
      name: string;
      lines: InvoiceAttentionLine[];
    }
  >();

  for (const line of attention) {
    const existing = byTherapist.get(line.therapistId);
    const entry = {
      invoiceNumber: line.invoiceNumber,
      claimNumber: line.claimNumber,
      clientName: line.clientName,
      section: line.section,
      serviceDates: line.serviceDates,
      eobCodes: line.eobCodes,
    };
    if (existing) {
      existing.lines.push(entry);
    } else {
      byTherapist.set(line.therapistId, {
        email: line.therapistEmail,
        name: line.therapistName,
        lines: [entry],
      });
    }
  }

  for (const therapist of byTherapist.values()) {
    try {
      await sendTherapistRaNeedsAttentionEmail({
        therapistEmail: therapist.email,
        therapistName: therapist.name,
        remittanceNumber: remittance.remittanceNumber,
        remittanceAdviceId: remittance.id,
        lines: therapist.lines,
      });
    } catch (error) {
      console.error("Therapist RA needs-attention email failed:", error);
    }
  }
}

export async function finalizeTherapistPayRun(remittanceAdviceId: string): Promise<void> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      payRun: {
        include: {
          payouts: {
            include: {
              therapist: { select: { email: true, firstName: true, lastName: true } },
              lines: {
                include: {
                  invoice: {
                    select: {
                      invoiceNumber: true,
                      client: { select: { lniClaimNumber: true } },
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
        })),
      });
    } catch (error) {
      console.error("Therapist pay-run finalized email failed:", error);
    }
  }
}
