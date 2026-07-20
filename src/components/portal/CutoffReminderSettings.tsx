"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCutoffReminderDaysAction } from "@/lib/portal-actions";
import {
  MAX_CUTOFF_REMINDER_DAYS,
  MIN_CUTOFF_REMINDER_DAYS,
} from "@/lib/cutoff-reminder-settings";
import {
  portalButtonClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

type Props = {
  earlierDays: number;
  laterDays: number;
};

export function CutoffReminderSettings({ earlierDays, laterDays }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [earlier, setEarlier] = useState(String(earlierDays));
  const [later, setLater] = useState(String(laterDays));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEarlier(String(earlierDays));
    setLater(String(laterDays));
  }, [earlierDays, laterDays]);

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCutoffReminderDaysAction(earlier, later);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.days) {
        setEarlier(String(result.days.earlierDays));
        setLater(String(result.days.laterDays));
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>Billing cutoff reminders</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
        Therapist email reminders
      </h2>
      <p className="mt-1 text-sm text-muted">
        Active therapists and admins receive two emails before each upcoming L&I cutoff, reminding
        therapists to submit invoices before noon on the cutoff date. Runs daily at 8:00 AM Pacific.
      </p>
      <p className="mt-2 text-sm text-muted">
        Separately, admins are emailed the day before each pay period’s expected L&I payment date
        (same daily schedule).
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cutoff-reminder-earlier" className={portalLabelCompactClass}>
            First reminder (X days before)
          </label>
          <input
            id="cutoff-reminder-earlier"
            type="number"
            min={MIN_CUTOFF_REMINDER_DAYS}
            max={MAX_CUTOFF_REMINDER_DAYS}
            value={earlier}
            disabled={pending}
            onChange={(event) => {
              setEarlier(event.target.value);
              setSaved(false);
            }}
            className={portalInputCompactClass}
          />
        </div>
        <div>
          <label htmlFor="cutoff-reminder-later" className={portalLabelCompactClass}>
            Second reminder (Y days before)
          </label>
          <input
            id="cutoff-reminder-later"
            type="number"
            min={MIN_CUTOFF_REMINDER_DAYS}
            max={MAX_CUTOFF_REMINDER_DAYS}
            value={later}
            disabled={pending}
            onChange={(event) => {
              setLater(event.target.value);
              setSaved(false);
            }}
            className={portalInputCompactClass}
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted">
        Allowed range: {MIN_CUTOFF_REMINDER_DAYS}–{MAX_CUTOFF_REMINDER_DAYS} days. The larger number
        is always treated as the first reminder.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark" role="status">
          Reminder schedule saved.
        </p>
      )}

      <div className="mt-4">
        <button type="button" onClick={onSave} disabled={pending} className={portalButtonClass}>
          {pending ? "Saving…" : "Save reminder days"}
        </button>
      </div>
    </section>
  );
}
