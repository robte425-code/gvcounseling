"use client";

import { useFormStatus } from "react-dom";
import { portalButtonClass } from "@/components/portal/ui";

type Props = {
  payPeriodId: string;
  queuedInvoices: number;
  periodLabel: string;
  generateAction: (formData: FormData) => Promise<void>;
};

function Generate837SubmitButton({
  queuedInvoices,
  periodLabel,
}: {
  queuedInvoices: number;
  periodLabel: string;
}) {
  const { pending } = useFormStatus();
  const disabled = pending;

  return (
    <button
      type="submit"
      disabled={disabled}
      title={
        queuedInvoices === 0
          ? `No invoices are ready for 837 generation in ${periodLabel}. Assign invoices to this pay period on the Invoices page.`
          : `Generate an 837 for ${queuedInvoices} invoice${queuedInvoices === 1 ? "" : "s"} not yet on a bill`
      }
      className={`${portalButtonClass} disabled:cursor-not-allowed`}
    >
      {pending
        ? "Generating…"
        : queuedInvoices > 0
          ? `Generate 837 (${queuedInvoices})`
          : "Generate 837"}
    </button>
  );
}

export function Generate837Form({
  payPeriodId,
  queuedInvoices,
  periodLabel,
  generateAction,
}: Props) {
  return (
    <form action={generateAction}>
      <input type="hidden" name="payPeriodId" value={payPeriodId} />
      <Generate837SubmitButton queuedInvoices={queuedInvoices} periodLabel={periodLabel} />
    </form>
  );
}
