import { portalCardClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import type { PaycheckPayoutNote } from "@/lib/paychecks";

type Props = {
  notes: string[];
  payoutNotes: PaycheckPayoutNote[];
  computedTherapistAmount: number;
  therapistAmount: number;
};

export function PaycheckNotesPanel({
  notes,
  payoutNotes,
  computedTherapistAmount,
  therapistAmount,
}: Props) {
  const adjusted = Math.abs(therapistAmount - computedTherapistAmount) > 0.001;
  if (!notes.length && !payoutNotes.length && !adjusted) return null;

  return (
    <section className={`${portalCardClass} border-amber-200 bg-amber-50/40`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Paycheck notes</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">Adjustments</h2>
      {adjusted && (
        <p className="mt-2 text-sm text-muted">
          Computed from invoices {formatCurrency(computedTherapistAmount)} · Final pay{" "}
          <span className="font-medium tabular-nums text-primary-dark">
            {formatCurrency(therapistAmount)}
          </span>
        </p>
      )}
      {payoutNotes.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {payoutNotes.map((entry) => (
            <li
              key={`${entry.remittanceNumber}-${entry.warrantRegister}-${entry.note ?? ""}`}
              className="rounded-xl border border-border bg-white/80 px-4 py-3 text-sm"
            >
              <p className="text-xs text-muted">
                RA {entry.remittanceNumber} · warrant {entry.warrantRegister}
              </p>
              {Math.abs(entry.paidAmount - entry.computedAmount) > 0.001 && (
                <p className="mt-1 tabular-nums text-muted">
                  Computed {formatCurrency(entry.computedAmount)} → paid{" "}
                  <span className="font-medium text-primary-dark">
                    {formatCurrency(entry.paidAmount)}
                  </span>
                </p>
              )}
              {entry.note ? (
                <p className="mt-1 text-primary-dark">{entry.note}</p>
              ) : (
                <p className="mt-1 text-muted">Amount adjusted (no note recorded).</p>
              )}
            </li>
          ))}
        </ul>
      ) : notes.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-primary-dark">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
