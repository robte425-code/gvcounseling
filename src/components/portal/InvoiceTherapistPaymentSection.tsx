import { formatCurrency } from "@/lib/constants";
import {
  therapistPaymentLabel,
  type TherapistPaymentInfo,
} from "@/lib/invoice-therapist-payment";

type Props = {
  therapistPayment: TherapistPaymentInfo;
  /** Invoice total when not yet in a pay run — shown for context only. */
  invoiceTotalAmount?: number;
};

export function InvoiceTherapistPaymentSection({
  therapistPayment,
  invoiceTotalAmount,
}: Props) {
  if (therapistPayment.display === "none") return null;

  const isPaid = therapistPayment.display === "paid";
  const amount = therapistPayment.payRunAmount;

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
        {therapistPaymentLabel(therapistPayment.display)}
        {amount != null ? ` · ${formatCurrency(amount)}` : ""}
      </p>
      {therapistPayment.display === "pending" && (
        <p className="mt-1 text-xs text-muted">
          Included in a pay run awaiting admin finalization.
          {amount != null &&
          invoiceTotalAmount != null &&
          Math.abs(amount - invoiceTotalAmount) > 0.01
            ? ` Invoice total is ${formatCurrency(invoiceTotalAmount)}.`
            : ""}
        </p>
      )}
      {isPaid && amount != null && (
        <p className="mt-1 text-xs text-muted">Finalized therapist pay for this invoice.</p>
      )}
    </div>
  );
}
