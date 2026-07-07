import { therapistPaymentLabel } from "@/lib/invoice-therapist-payment";

type Props = {
  therapistPaid: boolean;
};

export function InvoiceTherapistPaymentCell({ therapistPaid }: Props) {
  if (!therapistPaid) return <>—</>;

  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-emerald-900">
      {therapistPaymentLabel(true)}
    </span>
  );
}
