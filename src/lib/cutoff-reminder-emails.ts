import {
  sendAdminCutoffReminderEmail,
  sendTherapistCutoffReminderEmail,
} from "@/lib/portal-workflow-emails";
import { startOfUtcDay } from "@/lib/invoice-pay-period-grouping";
import {
  getCutoffReminderDays,
  markCutoffReminderSent,
  wasCutoffReminderSent,
} from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";

export type CutoffReminderSendResult = {
  payPeriodId: string;
  cutoffDate: string;
  daysBefore: number;
  therapistCount: number;
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

export async function findPayPeriodsDueForCutoffReminder(options?: {
  now?: Date;
  earlierDays?: number;
  laterDays?: number;
}): Promise<Array<{ payPeriodId: string; cutoffDate: Date; daysBefore: number }>> {
  const days =
    options?.earlierDays != null && options?.laterDays != null
      ? { earlierDays: options.earlierDays, laterDays: options.laterDays }
      : await getCutoffReminderDays();

  const today = startOfUtcDay(options?.now ?? new Date());
  const offsets = [...new Set([days.earlierDays, days.laterDays])];
  const targetDates = offsets.map((daysBefore) => ({
    daysBefore,
    date: addUtcDays(today, daysBefore),
  }));

  const payPeriods = await prisma.payPeriod.findMany({
    where: {
      cutoffDate: {
        in: targetDates.map((entry) => entry.date),
      },
    },
    select: { id: true, cutoffDate: true },
  });

  const due: Array<{ payPeriodId: string; cutoffDate: Date; daysBefore: number }> = [];
  for (const period of payPeriods) {
    const match = targetDates.find((entry) => sameUtcDay(entry.date, period.cutoffDate));
    if (!match) continue;
    due.push({
      payPeriodId: period.id,
      cutoffDate: period.cutoffDate,
      daysBefore: match.daysBefore,
    });
  }

  return due.sort((a, b) => b.daysBefore - a.daysBefore);
}

export async function sendCutoffReminderEmails(options?: {
  now?: Date;
  earlierDays?: number;
  laterDays?: number;
  /** When true, send even if already marked sent (smoke/tests only). */
  force?: boolean;
}): Promise<{
  reminderCount: number;
  therapistEmails: number;
  adminEmails: number;
  results: CutoffReminderSendResult[];
}> {
  const due = await findPayPeriodsDueForCutoffReminder(options);
  const results: CutoffReminderSendResult[] = [];
  let therapistEmails = 0;
  let adminEmails = 0;

  if (due.length === 0) {
    return { reminderCount: 0, therapistEmails: 0, adminEmails: 0, results };
  }

  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST", active: true },
    select: { id: true, email: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const therapistIds = therapists.map((t) => t.id);
  const draftCounts =
    therapistIds.length > 0
      ? await prisma.invoice.groupBy({
          by: ["therapistId"],
          where: { status: "DRAFT", therapistId: { in: therapistIds } },
          _count: true,
        })
      : [];
  const submittedCounts =
    therapistIds.length > 0
      ? await prisma.invoice.groupBy({
          by: ["therapistId"],
          where: { status: "SUBMITTED", therapistId: { in: therapistIds } },
          _count: true,
        })
      : [];
  const draftByTherapist = new Map(draftCounts.map((row) => [row.therapistId, row._count]));
  const submittedByTherapist = new Map(
    submittedCounts.map((row) => [row.therapistId, row._count]),
  );

  const therapistSummaries = therapists.map((therapist) => ({
    therapistName: `${therapist.firstName} ${therapist.lastName}`.trim(),
    draftInvoiceCount: draftByTherapist.get(therapist.id) ?? 0,
    submittedInvoiceCount: submittedByTherapist.get(therapist.id) ?? 0,
  }));

  for (const entry of due) {
    if (!options?.force && (await wasCutoffReminderSent(entry.payPeriodId, entry.daysBefore))) {
      results.push({
        payPeriodId: entry.payPeriodId,
        cutoffDate: entry.cutoffDate.toISOString().slice(0, 10),
        daysBefore: entry.daysBefore,
        therapistCount: 0,
        adminCount: 0,
        skippedAlreadySent: true,
      });
      continue;
    }

    let sentForPeriod = 0;
    for (const therapist of therapists) {
      try {
        await sendTherapistCutoffReminderEmail({
          therapistEmail: therapist.email,
          therapistName: `${therapist.firstName} ${therapist.lastName}`.trim(),
          cutoffDate: entry.cutoffDate,
          daysBefore: entry.daysBefore,
          draftInvoiceCount: draftByTherapist.get(therapist.id) ?? 0,
          submittedInvoiceCount: submittedByTherapist.get(therapist.id) ?? 0,
        });
        sentForPeriod += 1;
        therapistEmails += 1;
      } catch (error) {
        console.error(
          `Cutoff reminder failed for therapist ${therapist.id} (payPeriod ${entry.payPeriodId}):`,
          error,
        );
      }
    }

    let adminCount = 0;
    try {
      await sendAdminCutoffReminderEmail({
        cutoffDate: entry.cutoffDate,
        daysBefore: entry.daysBefore,
        therapists: therapistSummaries,
      });
      adminCount = 1;
      adminEmails += 1;
    } catch (error) {
      console.error(
        `Cutoff reminder failed for admins (payPeriod ${entry.payPeriodId}):`,
        error,
      );
    }

    await markCutoffReminderSent(entry.payPeriodId, entry.daysBefore, options?.now ?? new Date());
    results.push({
      payPeriodId: entry.payPeriodId,
      cutoffDate: entry.cutoffDate.toISOString().slice(0, 10),
      daysBefore: entry.daysBefore,
      therapistCount: sentForPeriod,
      adminCount,
      skippedAlreadySent: false,
    });
  }

  return {
    reminderCount: results.filter((row) => !row.skippedAlreadySent).length,
    therapistEmails,
    adminEmails,
    results,
  };
}
