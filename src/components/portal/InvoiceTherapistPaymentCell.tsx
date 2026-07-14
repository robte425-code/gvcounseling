import {
  therapistPaymentLabel,
  type TherapistPaymentDisplay,
} from "@/lib/invoice-therapist-payment";

type Props = {
  therapistPayment: TherapistPaymentDisplay;
};

export function InvoiceTherapistPaymentCell({ therapistPayment }: Props) {
  if (therapistPayment === "none") return <>—</>;

  if (therapistPayment === "pending") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-amber-950">
        {therapistPaymentLabel("pending")}
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-emerald-900">
      {therapistPaymentLabel("paid")}
    </span>
  );
}
