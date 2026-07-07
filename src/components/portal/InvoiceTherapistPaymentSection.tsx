import { therapistPaymentLabel } from "@/lib/invoice-therapist-payment";

type Props = {
  therapistPaid: boolean;
};

export function InvoiceTherapistPaymentSection({ therapistPaid }: Props) {
  if (!therapistPaid) return null;

  return (
    <div className="mt-3 rounded-xl border border-border bg-emerald-50/40 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment</p>
      <p className="mt-2 text-sm font-medium text-emerald-900">{therapistPaymentLabel(true)}</p>
    </div>
  );
}
