import {
  therapistPaymentLabel,
  type TherapistPaymentDisplay,
} from "@/lib/invoice-therapist-payment";

type Props = {
  therapistPayment: TherapistPaymentDisplay;
};

export function InvoiceTherapistPaymentSection({ therapistPayment }: Props) {
  if (therapistPayment === "none") return null;

  const isPaid = therapistPayment === "paid";

  return (
    <div
      className={`mt-3 rounded-xl border border-border px-4 py-3 ${
        isPaid ? "bg-emerald-50/40" : "bg-amber-50/50"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Therapist payment</p>
      <p
        className={`mt-2 text-sm font-medium ${
          isPaid ? "text-emerald-900" : "text-amber-950"
        }`}
      >
        {therapistPaymentLabel(therapistPayment)}
      </p>
      {therapistPayment === "pending" && (
        <p className="mt-1 text-xs text-muted">
          Included in a pay run awaiting admin finalization.
        </p>
      )}
    </div>
  );
}
