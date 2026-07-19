"use client";

import { useActionState } from "react";
import {
  updateTherapistPayRunPayoutAdjustmentAction,
  type UpdateTherapistPayoutAdjustmentState,
} from "@/lib/portal-actions";
import {
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";

const initial: UpdateTherapistPayoutAdjustmentState = {};

export function TherapistPayoutAdjustForm({
  payoutId,
  remittanceAdviceId,
  therapistName,
  computedAmount,
  amount,
  adjustmentNote,
  canEdit,
}: {
  payoutId: string;
  remittanceAdviceId: string;
  therapistName: string;
  computedAmount: number;
  amount: number;
  adjustmentNote: string | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateTherapistPayRunPayoutAdjustmentAction,
    initial,
  );

  const adjusted = Math.abs(amount - computedAmount) > 0.001;

  if (!canEdit) {
    return (
      <div className="mt-2 space-y-1 text-xs text-muted">
        <p>
          Computed {formatCurrency(computedAmount)}
          {adjusted ? ` · paid ${formatCurrency(amount)}` : ""}
        </p>
        {adjustmentNote && <p className="text-primary-dark">Note: {adjustmentNote}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-border/60 pt-3">
      <input type="hidden" name="payoutId" value={payoutId} />
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <p className="text-xs text-muted">
        Computed from invoices:{" "}
        <span className="tabular-nums text-primary-dark">{formatCurrency(computedAmount)}</span>
      </p>
      <div>
        <label className={portalLabelCompactClass} htmlFor={`amount-${payoutId}`}>
          Final paycheck amount
        </label>
        <input
          id={`amount-${payoutId}`}
          name="therapistAmount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          defaultValue={amount.toFixed(2)}
          className={portalInputCompactClass}
          required
        />
      </div>
      <div>
        <label className={portalLabelCompactClass} htmlFor={`note-${payoutId}`}>
          Adjustment note{adjusted ? " (required when amount changes)" : " (optional)"}
        </label>
        <textarea
          id={`note-${payoutId}`}
          name="adjustmentNote"
          rows={2}
          defaultValue={adjustmentNote ?? ""}
          placeholder={`Reason for changing ${therapistName}'s paycheck…`}
          className={portalInputCompactClass}
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
      <button type="submit" className={`${portalButtonSecondaryClass} !min-h-9 !px-4 !text-xs`} disabled={pending}>
        {pending ? "Saving…" : "Save paycheck amount"}
      </button>
    </form>
  );
}
