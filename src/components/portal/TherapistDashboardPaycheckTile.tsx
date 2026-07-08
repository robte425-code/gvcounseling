import Link from "next/link";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import type { PaycheckSummaryRow } from "@/lib/paychecks";

type Props = {
  paycheck: PaycheckSummaryRow | null;
};

export function TherapistDashboardPaycheckTile({ paycheck }: Props) {
  if (!paycheck) {
    return (
      <section className={portalCardClass}>
        <p className={portalSectionHeadingClass}>Latest paycheck</p>
        <p className="mt-2 text-sm text-muted">
          No paychecks yet. Your pay will appear here after L&I remittances are applied.
        </p>
        <Link href="/portal/therapist/paychecks" className={`${portalButtonSecondaryClass} mt-4 inline-flex`}>
          Paychecks
        </Link>
      </section>
    );
  }

  return (
    <section className={`${portalCardClass} border-primary/25 bg-primary/5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={portalSectionHeadingClass}>Current paycheck</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-primary-dark">
            {paycheck.payPeriodLabel}
          </h2>
          <p className="mt-1 text-sm text-muted">
            L&I payment {paycheck.paymentDateLabel ?? "—"} · Cutoff {paycheck.cutoffLabel}
          </p>
          <p className="mt-1 text-sm text-muted">
            {paycheck.invoiceCount} paid invoice{paycheck.invoiceCount === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-3xl font-semibold tabular-nums text-primary-dark">
          {formatCurrency(paycheck.therapistAmount)}
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/portal/therapist/paychecks/${paycheck.payPeriodId}`}
          className={portalButtonClass}
        >
          View paycheck
        </Link>
        <Link href="/portal/therapist/paychecks" className={portalButtonSecondaryClass}>
          All paychecks
        </Link>
      </div>
    </section>
  );
}
