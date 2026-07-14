/** Shared cutoff-reminder constants (safe for client components). */

export const DEFAULT_CUTOFF_REMINDER_DAYS_EARLIER = 7;
export const DEFAULT_CUTOFF_REMINDER_DAYS_LATER = 2;
export const MIN_CUTOFF_REMINDER_DAYS = 1;
export const MAX_CUTOFF_REMINDER_DAYS = 30;

export type CutoffReminderDays = {
  /** First reminder — more days before cutoff (X). */
  earlierDays: number;
  /** Second reminder — fewer days before cutoff (Y). */
  laterDays: number;
};

export function parseCutoffReminderDays(value: string | null | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < MIN_CUTOFF_REMINDER_DAYS || n > MAX_CUTOFF_REMINDER_DAYS) {
    return undefined;
  }
  return n;
}

export function normalizeCutoffReminderDays(
  earlierDays: number,
  laterDays: number,
): CutoffReminderDays {
  let earlier = earlierDays;
  let later = laterDays;
  if (earlier === later) {
    later = Math.max(MIN_CUTOFF_REMINDER_DAYS, earlier - 1);
  }
  if (later > earlier) {
    const swap = earlier;
    earlier = later;
    later = swap;
  }
  return { earlierDays: earlier, laterDays: later };
}
