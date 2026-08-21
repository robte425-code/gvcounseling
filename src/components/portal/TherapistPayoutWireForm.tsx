"use client";

import { useActionState } from "react";
import {
  recordTherapistPayoutWireAction,
  type RecordTherapistPayoutWireState,
} from "@/lib/portal-actions";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import {
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import { formatCalendarDate } from "@/lib/constants";

const initial: RecordTherapistPayoutWireState = {};

export function TherapistPayoutWireForm({
  payoutId,
  remittanceAdviceId,
  therapistName,
  amountLabel,
  wireSentAt,
  wireReference,
  canEdit,
}: {
  payoutId: string;
  remittanceAdviceId: string;
  therapistName: string;
  amountLabel: string;
  /** Calendar ISO (YYYY-MM-DD), or null when no wire is recorded yet. */
  wireSentAt: string | null;
  wireReference: string | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(recordTherapistPayoutWireAction, initial);

  if (wireSentAt) {
    return (
      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
        <p className="text-xs text-emerald-900">
          Wire sent {formatCalendarDate(wireSentAt)}
          {wireReference ? ` · ref ${wireReference}` : ""}
        </p>
        {canEdit && (
          <form action={formAction}>
            <input type="hidden" name="payoutId" value={payoutId} />
            <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
            <input type="hidden" name="clear" value="1" />
            <ConfirmSubmitButton
              confirmMessage={`Clear the recorded wire for ${therapistName}? Do this only if the wire was not actually sent, or was sent for a different amount. The paycheck amount becomes editable again.`}
              className="text-xs text-red-700 hover:underline"
              disabled={pending}
            >
              Clear recorded wire
            </ConfirmSubmitButton>
          </form>
        )}
        {state.error && (
          <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800" role="alert">
            {state.error}
          </p>
        )}
      </div>
    );
  }

  if (!canEdit) return null;

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-border/60 pt-3">
      <input type="hidden" name="payoutId" value={payoutId} />
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <p className="text-xs text-muted">
        After sending {amountLabel} to {therapistName} from BECU, record it here. This locks the
        paycheck amount so it matches what was actually wired.
      </p>
      <div>
        <label className={portalLabelCompactClass} htmlFor={`wire-date-${payoutId}`}>
          Wire sent date
        </label>
        <input
          id={`wire-date-${payoutId}`}
          name="wireSentAt"
          type="date"
          className={portalInputCompactClass}
          required
        />
      </div>
      <div>
        <label className={portalLabelCompactClass} htmlFor={`wire-ref-${payoutId}`}>
          BECU confirmation number
        </label>
        <input
          id={`wire-ref-${payoutId}`}
          name="wireReference"
          type="text"
          placeholder="e.g. 1234567890"
          className={portalInputCompactClass}
          required
        />
      </div>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-primary/10 px-2 py-1.5 text-xs text-primary-dark" role="status">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        className={`${portalButtonSecondaryClass} !min-h-9 !px-4 !text-xs`}
        disabled={pending}
      >
        {pending ? "Recording…" : "Record wire sent"}
      </button>
    </form>
  );
}
