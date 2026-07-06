import type { PaymentStatus } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import { parseInvoiceEobDescriptions } from "@/lib/invoice-payment-status";

type Props = {
  paymentStatus: PaymentStatus | null;
  lniPaidAt: Date | null;
  lniEobCodes: string[];
  lniEobCodeDescriptions: unknown;
};

export function InvoiceLniPaymentSection({
  paymentStatus,
  lniPaidAt,
  lniEobCodes,
  lniEobCodeDescriptions,
}: Props) {
  if (!paymentStatus) return null;

  const descriptions = parseInvoiceEobDescriptions(lniEobCodeDescriptions);

  return (
    <div className="mt-3 rounded-xl border border-border bg-primary/[0.03] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">L&I payment</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={paymentStatus} />
        {paymentStatus === "PAID" && lniPaidAt && (
          <span className="text-sm text-muted">Paid {formatDate(lniPaidAt)}</span>
        )}
      </div>
      {lniEobCodes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-foreground">
          {lniEobCodes.map((code) => (
            <li key={code}>
              <span className="font-medium text-primary-dark">EOB {code}</span>
              {descriptions[code] ? (
                <span className="text-muted"> — {descriptions[code]}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
