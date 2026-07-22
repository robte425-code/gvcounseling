import { calendarIsoFromDate, formatDate } from "@/lib/constants";
import { payPeriodLabel } from "@/lib/invoice-pay-period-grouping";
import { excludeSyntheticSpreadsheetRemittancesWhere } from "@/lib/remittance-advice";
import { prisma } from "@/lib/prisma";

export type PaycheckSummaryRow = {
  payPeriodId: string;
  payPeriodLabel: string;
  paymentDateLabel: string | null;
  cutoffLabel: string;
  therapistId: string;
  therapistName: string;
  therapistAmount: number;
  computedTherapistAmount: number;
  lniPaidAmount: number;
  invoiceCount: number;
  remittanceCount: number;
  /** Admin adjustment notes (and similar) from payouts on this paycheck. */
  notes: string[];
};

export type PaycheckInvoiceRow = {
  id: string;
  invoiceNumber: number;
  clientLabel: string;
  serviceDates: string;
  billingPayPeriodLabel: string | null;
  billingPayPeriodId: string | null;
  lniPaidAmount: number;
  therapistAmount: number;
  lniPaidAt: string | null;
  remittanceNumber: string;
  warrantRegister: string;
  remittanceInvoiceDate: string;
  invoiceHref: string;
};

export type PaycheckPayoutNote = {
  remittanceNumber: string;
  warrantRegister: string;
  computedAmount: number;
  paidAmount: number;
  note: string | null;
};

function sameUtcDay(a: Date, b: Date): boolean {
  return calendarIsoFromDate(a) === calendarIsoFromDate(b);
}

function payoutTherapistName(therapist: { firstName: string; lastName: string }): string {
  return `${therapist.firstName} ${therapist.lastName}`;
}

function formatPayoutNote(payout: {
  therapistAmount: unknown;
  computedTherapistAmount: unknown;
  adjustmentNote: string | null;
}): string | null {
  const paid = Number(payout.therapistAmount);
  const computed = Number(payout.computedTherapistAmount);
  const adjusted = Math.abs(paid - computed) > 0.001;
  const note = payout.adjustmentNote?.trim() || null;
  if (!adjusted && !note) return null;
  if (adjusted && note) {
    return `Adjusted from $${computed.toFixed(2)} to $${paid.toFixed(2)}: ${note}`;
  }
  if (adjusted) {
    return `Adjusted from $${computed.toFixed(2)} to $${paid.toFixed(2)}`;
  }
  return note;
}

export async function loadPaycheckSummaries(options?: {
  therapistId?: string;
}): Promise<PaycheckSummaryRow[]> {
  const [payPeriods, payouts] = await Promise.all([
    prisma.payPeriod.findMany({
      where: { paymentDate: { not: null } },
      orderBy: { cutoffDate: "desc" },
      select: { id: true, label: true, cutoffDate: true, paymentDate: true },
    }),
    prisma.therapistPayRunPayout.findMany({
      where: {
        ...(options?.therapistId ? { therapistId: options.therapistId } : {}),
        payRun: {
          status: "FINALIZED",
          remittanceAdvice: excludeSyntheticSpreadsheetRemittancesWhere,
        },
      },
      include: {
        therapist: { select: { id: true, firstName: true, lastName: true } },
        payRun: {
          include: {
            remittanceAdvice: {
              select: { id: true, invoiceDate: true },
            },
          },
        },
      },
    }),
  ]);

  const payPeriodByPaymentDate = new Map<string, (typeof payPeriods)[number]>();
  for (const period of payPeriods) {
    if (!period.paymentDate) continue;
    payPeriodByPaymentDate.set(calendarIsoFromDate(period.paymentDate), period);
  }

  const grouped = new Map<
    string,
    {
      payPeriod: (typeof payPeriods)[number];
      therapistId: string;
      therapistName: string;
      therapistAmount: number;
      computedTherapistAmount: number;
      lniPaidAmount: number;
      invoiceCount: number;
      remittanceIds: Set<string>;
      notes: string[];
    }
  >();

  for (const payout of payouts) {
    const remittance = payout.payRun.remittanceAdvice;
    const period = payPeriodByPaymentDate.get(calendarIsoFromDate(remittance.invoiceDate));
    if (!period) continue;

    const key = `${period.id}:${payout.therapistId}`;
    const note = formatPayoutNote(payout);
    const existing = grouped.get(key);
    if (existing) {
      existing.therapistAmount += Number(payout.therapistAmount);
      existing.computedTherapistAmount += Number(payout.computedTherapistAmount);
      existing.lniPaidAmount += Number(payout.lniPaidAmount);
      existing.invoiceCount += payout.invoiceCount;
      existing.remittanceIds.add(remittance.id);
      if (note && !existing.notes.includes(note)) existing.notes.push(note);
    } else {
      grouped.set(key, {
        payPeriod: period,
        therapistId: payout.therapistId,
        therapistName: payoutTherapistName(payout.therapist),
        therapistAmount: Number(payout.therapistAmount),
        computedTherapistAmount: Number(payout.computedTherapistAmount),
        lniPaidAmount: Number(payout.lniPaidAmount),
        invoiceCount: payout.invoiceCount,
        remittanceIds: new Set([remittance.id]),
        notes: note ? [note] : [],
      });
    }
  }

  return [...grouped.values()]
    .sort((a, b) => {
      const paymentA = a.payPeriod.paymentDate?.getTime() ?? 0;
      const paymentB = b.payPeriod.paymentDate?.getTime() ?? 0;
      if (paymentB !== paymentA) return paymentB - paymentA;
      const cutoffCmp = b.payPeriod.cutoffDate.getTime() - a.payPeriod.cutoffDate.getTime();
      if (cutoffCmp !== 0) return cutoffCmp;
      return a.therapistName.localeCompare(b.therapistName);
    })
    .map((row) => ({
      payPeriodId: row.payPeriod.id,
      payPeriodLabel: payPeriodLabel(row.payPeriod) ?? formatDate(row.payPeriod.cutoffDate),
      paymentDateLabel: row.payPeriod.paymentDate ? formatDate(row.payPeriod.paymentDate) : null,
      cutoffLabel: formatDate(row.payPeriod.cutoffDate),
      therapistId: row.therapistId,
      therapistName: row.therapistName,
      therapistAmount: row.therapistAmount,
      computedTherapistAmount: row.computedTherapistAmount,
      lniPaidAmount: row.lniPaidAmount,
      invoiceCount: row.invoiceCount,
      remittanceCount: row.remittanceIds.size,
      notes: row.notes,
    }));
}

export async function loadPaycheckDetail(options: {
  payPeriodId: string;
  therapistId: string;
  invoiceBasePath: "/portal/admin/invoices" | "/portal/therapist/invoices";
}): Promise<{
  payPeriodLabel: string;
  paymentDateLabel: string | null;
  therapistName: string;
  therapistAmount: number;
  computedTherapistAmount: number;
  lniPaidAmount: number;
  notes: string[];
  payoutNotes: PaycheckPayoutNote[];
  invoices: PaycheckInvoiceRow[];
} | null> {
  const payPeriod = await prisma.payPeriod.findUnique({
    where: { id: options.payPeriodId },
    select: { id: true, label: true, cutoffDate: true, paymentDate: true },
  });
  if (!payPeriod?.paymentDate) return null;

  const payouts = await prisma.therapistPayRunPayout.findMany({
    where: {
      therapistId: options.therapistId,
      payRun: {
        status: "FINALIZED",
        remittanceAdvice: excludeSyntheticSpreadsheetRemittancesWhere,
      },
    },
    include: {
      therapist: { select: { firstName: true, lastName: true } },
      lines: {
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              lniPaidAt: true,
              payPeriodId: true,
              payPeriod: { select: { label: true, cutoffDate: true } },
              client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
              lineItems: { select: { serviceDate: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      payRun: {
        include: {
          remittanceAdvice: {
            select: {
              invoiceDate: true,
              remittanceNumber: true,
              warrantRegister: true,
            },
          },
        },
      },
    },
  });

  const matchingPayouts = payouts.filter((payout) =>
    sameUtcDay(payout.payRun.remittanceAdvice.invoiceDate, payPeriod.paymentDate!),
  );
  if (!matchingPayouts.length) return null;

  const therapistName = payoutTherapistName(matchingPayouts[0]!.therapist);
  let therapistAmount = 0;
  let computedTherapistAmount = 0;
  let lniPaidAmount = 0;
  const notes: string[] = [];
  const payoutNotes: PaycheckPayoutNote[] = [];
  const invoices: PaycheckInvoiceRow[] = [];

  for (const payout of matchingPayouts) {
    therapistAmount += Number(payout.therapistAmount);
    computedTherapistAmount += Number(payout.computedTherapistAmount);
    lniPaidAmount += Number(payout.lniPaidAmount);

    const noteText = formatPayoutNote(payout);
    if (noteText && !notes.includes(noteText)) notes.push(noteText);

    const adjusted =
      Math.abs(Number(payout.therapistAmount) - Number(payout.computedTherapistAmount)) > 0.001;
    if (adjusted || payout.adjustmentNote?.trim()) {
      payoutNotes.push({
        remittanceNumber: payout.payRun.remittanceAdvice.remittanceNumber,
        warrantRegister: payout.payRun.remittanceAdvice.warrantRegister,
        computedAmount: Number(payout.computedTherapistAmount),
        paidAmount: Number(payout.therapistAmount),
        note: payout.adjustmentNote?.trim() || null,
      });
    }

    for (const line of payout.lines) {
      const inv = line.invoice;
      const serviceDates = inv.lineItems
        .map((item) => formatDate(item.serviceDate))
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .join(", ");

      invoices.push({
        id: line.id,
        invoiceNumber: inv.invoiceNumber,
        clientLabel: `${inv.client.lastName}, ${inv.client.firstName} (${inv.client.lniClaimNumber})`,
        serviceDates: serviceDates || "—",
        billingPayPeriodLabel: payPeriodLabel(inv.payPeriod),
        billingPayPeriodId: inv.payPeriodId,
        lniPaidAmount: Number(line.lniPaidAmount),
        therapistAmount: Number(line.therapistAmount),
        lniPaidAt: inv.lniPaidAt?.toISOString() ?? null,
        remittanceNumber: payout.payRun.remittanceAdvice.remittanceNumber,
        warrantRegister: payout.payRun.remittanceAdvice.warrantRegister,
        remittanceInvoiceDate: formatDate(payout.payRun.remittanceAdvice.invoiceDate),
        invoiceHref: `${options.invoiceBasePath}/${inv.id}`,
      });
    }
  }

  invoices.sort((a, b) => a.invoiceNumber - b.invoiceNumber);

  return {
    payPeriodLabel: payPeriodLabel(payPeriod) ?? formatDate(payPeriod.cutoffDate),
    paymentDateLabel: formatDate(payPeriod.paymentDate),
    therapistName,
    therapistAmount,
    computedTherapistAmount,
    lniPaidAmount,
    notes,
    payoutNotes,
    invoices,
  };
}
