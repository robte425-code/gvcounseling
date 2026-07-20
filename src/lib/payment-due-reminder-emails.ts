import { sendAdminPaymentDueReminderEmail } from "@/lib/portal-workflow-emails";
import { startOfUtcDay } from "@/lib/invoice-pay-period-grouping";
import {
  markPaymentDueReminderSent,
  wasPaymentDueReminderSent,
} from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";

/** Fixed offset: email admins the calendar day before expected L&I payment. */
export const PAYMENT_DUE_REMINDER_DAYS_BEFORE = 1;

export type PaymentDueReminderSendResult = {
  payPeriodId: string;
  paymentDate: string;
  cutoffDate: string;
  daysBefore: number;
  adminCount: number;
  skippedAlreadySent: boolean;
};

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function findPayPeriodsDueForPaymentReminder(options?: {
  now?: Date;
  daysBefore?: number;
}): Promise<
  Array<{
    payPeriodId: string;
    paymentDate: Date;
    cutoffDate: Date;
    label: string | null;
    daysBefore: number;
  }>
> {
  const daysBefore = options?.daysBefore ?? PAYMENT_DUE_REMINDER_DAYS_BEFORE;
  const today = startOfUtcDay(options?.now ?? new Date());
  const targetPaymentDate = addUtcDays(today, daysBefore);

  const payPeriods = await prisma.payPeriod.findMany({
    where: {
      paymentDate: targetPaymentDate,
    },
    select: { id: true, paymentDate: true, cutoffDate: true, label: true },
  });

  const due: Array<{
    payPeriodId: string;
    paymentDate: Date;
    cutoffDate: Date;
    label: string | null;
    daysBefore: number;
  }> = [];

  for (const period of payPeriods) {
    if (!period.paymentDate) continue;
    if (!sameUtcDay(period.paymentDate, targetPaymentDate)) continue;
    due.push({
      payPeriodId: period.id,
      paymentDate: period.paymentDate,
      cutoffDate: period.cutoffDate,
      label: period.label,
      daysBefore,
    });
  }

  return due.sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());
}

export async function sendPaymentDueReminderEmails(options?: {
  now?: Date;
  daysBefore?: number;
  /** When true, send even if already marked sent (smoke/tests only). */
  force?: boolean;
}): Promise<{
  reminderCount: number;
  adminEmails: number;
  results: PaymentDueReminderSendResult[];
}> {
  const due = await findPayPeriodsDueForPaymentReminder(options);
  const results: PaymentDueReminderSendResult[] = [];
  let adminEmails = 0;

  if (due.length === 0) {
    return { reminderCount: 0, adminEmails: 0, results };
  }

  for (const entry of due) {
    if (
      !options?.force &&
      (await wasPaymentDueReminderSent(entry.payPeriodId, entry.daysBefore))
    ) {
      results.push({
        payPeriodId: entry.payPeriodId,
        paymentDate: entry.paymentDate.toISOString().slice(0, 10),
        cutoffDate: entry.cutoffDate.toISOString().slice(0, 10),
        daysBefore: entry.daysBefore,
        adminCount: 0,
        skippedAlreadySent: true,
      });
      continue;
    }

    const paymentDayStart = startOfUtcDay(entry.paymentDate);
    const paymentDayEnd = addUtcDays(paymentDayStart, 1);

    const [invoiceCount, remittanceCount] = await Promise.all([
      prisma.invoice.count({ where: { payPeriodId: entry.payPeriodId } }),
      prisma.remittanceAdvice.count({
        where: {
          invoiceDate: {
            gte: paymentDayStart,
            lt: paymentDayEnd,
          },
        },
      }),
    ]);

    let adminCount = 0;
    try {
      await sendAdminPaymentDueReminderEmail({
        paymentDate: entry.paymentDate,
        cutoffDate: entry.cutoffDate,
        label: entry.label,
        invoiceCount,
        remittanceCount,
        daysBefore: entry.daysBefore,
      });
      adminCount = 1;
      adminEmails += 1;
    } catch (error) {
      console.error(
        `Payment due reminder failed for admins (payPeriod ${entry.payPeriodId}):`,
        error,
      );
    }

    await markPaymentDueReminderSent(
      entry.payPeriodId,
      entry.daysBefore,
      options?.now ?? new Date(),
    );

    results.push({
      payPeriodId: entry.payPeriodId,
      paymentDate: entry.paymentDate.toISOString().slice(0, 10),
      cutoffDate: entry.cutoffDate.toISOString().slice(0, 10),
      daysBefore: entry.daysBefore,
      adminCount,
      skippedAlreadySent: false,
    });
  }

  return {
    reminderCount: results.filter((row) => !row.skippedAlreadySent).length,
    adminEmails,
    results,
  };
}
