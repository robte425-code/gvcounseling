import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTherapist } from "@/auth";
import { PaycheckDetailTable } from "@/components/portal/PaycheckDetailTable";
import { PaycheckNotesPanel } from "@/components/portal/PaycheckNotesPanel";
import { portalCardClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import { loadPaycheckDetail } from "@/lib/paychecks";

export default async function TherapistPaycheckDetailPage({
  params,
}: {
  params: Promise<{ payPeriodId: string }>;
}) {
  const session = await requireTherapist();
  const { payPeriodId } = await params;

  const detail = await loadPaycheckDetail({
    payPeriodId,
    therapistId: session.user.id,
    invoiceBasePath: "/portal/therapist/invoices",
  });
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/therapist/paychecks" className="text-sm text-primary hover:underline">
          ← All paychecks
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-primary-dark">
          {detail.payPeriodLabel}
        </h1>
        <p className="mt-2 text-sm text-muted">
          L&I payment date {detail.paymentDateLabel ?? "—"}. Invoices paid on this warrant.
        </p>
      </div>

      <div className={`${portalCardClass} grid gap-4 sm:grid-cols-2`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invoices</p>
          <p className="mt-1 text-2xl font-semibold text-primary-dark">{detail.invoices.length}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your pay</p>
          <p className="mt-1 text-2xl font-semibold text-primary-dark">
            {formatCurrency(detail.therapistAmount)}
          </p>
          {Math.abs(detail.therapistAmount - detail.computedTherapistAmount) > 0.001 && (
            <p className="mt-1 text-xs text-muted">
              Computed {formatCurrency(detail.computedTherapistAmount)}
            </p>
          )}
        </div>
      </div>

      <PaycheckNotesPanel
        notes={detail.notes}
        payoutNotes={detail.payoutNotes}
        computedTherapistAmount={detail.computedTherapistAmount}
        therapistAmount={detail.therapistAmount}
      />

      <PaycheckDetailTable invoices={detail.invoices} paycheckPayPeriodId={payPeriodId} />
    </div>
  );
}
