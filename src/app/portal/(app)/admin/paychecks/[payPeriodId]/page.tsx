import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { PaycheckDetailTable } from "@/components/portal/PaycheckDetailTable";
import { portalCardClass } from "@/components/portal/ui";
import { formatCurrency } from "@/lib/constants";
import { loadPaycheckDetail } from "@/lib/paychecks";

export default async function AdminPaycheckDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ payPeriodId: string }>;
  searchParams: Promise<{ therapistId?: string }>;
}) {
  await requireAdmin();
  const { payPeriodId } = await params;
  const { therapistId } = await searchParams;
  if (!therapistId?.trim()) notFound();

  const detail = await loadPaycheckDetail({
    payPeriodId,
    therapistId: therapistId.trim(),
    invoiceBasePath: "/portal/admin/invoices",
  });
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/admin/paychecks" className="text-sm text-primary hover:underline">
          ← All paychecks
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-primary-dark">
          {detail.therapistName} — {detail.payPeriodLabel}
        </h1>
        <p className="mt-2 text-sm text-muted">
          L&I payment date {detail.paymentDateLabel ?? "—"}. Invoices paid on this warrant for this
          therapist.
        </p>
      </div>

      <div className={`${portalCardClass} grid gap-4 sm:grid-cols-3`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invoices</p>
          <p className="mt-1 text-2xl font-semibold text-primary-dark">{detail.invoices.length}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">L&I paid</p>
          <p className="mt-1 text-2xl font-semibold text-primary-dark">
            {formatCurrency(detail.lniPaidAmount)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Therapist pay</p>
          <p className="mt-1 text-2xl font-semibold text-primary-dark">
            {formatCurrency(detail.therapistAmount)}
          </p>
        </div>
      </div>

      <PaycheckDetailTable invoices={detail.invoices} paycheckPayPeriodId={payPeriodId} />
    </div>
  );
}
