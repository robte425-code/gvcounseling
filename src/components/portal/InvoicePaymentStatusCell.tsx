import type { PaymentStatus } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import {
  formatInvoiceEobNotes,
  parseInvoiceEobDescriptions,
} from "@/lib/invoice-payment-status";

type Props = {
  paymentStatus: PaymentStatus | null;
  lniPaidAt?: string | null;
  lniEobCodes?: string[];
  lniEobCodeDescriptions?: unknown;
};

export function InvoicePaymentStatusCell({
  paymentStatus,
  lniPaidAt,
  lniEobCodes = [],
  lniEobCodeDescriptions,
}: Props) {
  if (!paymentStatus) return <>—</>;

  const eobNotes = formatInvoiceEobNotes(
    lniEobCodes,
    parseInvoiceEobDescriptions(lniEobCodeDescriptions),
  );

  return (
    <div className="max-w-sm space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={paymentStatus} />
        {paymentStatus === "PAID" && lniPaidAt && (
          <span className="text-xs text-muted">{formatDate(new Date(lniPaidAt))}</span>
        )}
      </div>
      {eobNotes && <p className="text-xs leading-snug text-muted">{eobNotes}</p>}
    </div>
  );
}
