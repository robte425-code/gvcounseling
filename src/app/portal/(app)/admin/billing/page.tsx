import Link from "next/link";
import { requireAdmin } from "@/auth";
import { Generate837Form } from "@/components/portal/Generate837Form";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import {
  createPayPeriodAction,
  deletePayPeriodAction,
  emailVrcsForPayPeriodAction,
  generateBillAction,
  syncPayPeriodsFromLniAction,
} from "@/lib/portal-actions";
import { LNI_PAYMENT_STATUS_URL } from "@/lib/lni-pay-periods";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { LniFeesSection } from "@/components/portal/LniFeesSection";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    synced?: string;
    created?: string;
    updated?: string;
    total?: string;
    vrcEmailed?: string;
    sent?: string;
    vrcSkipped?: string;
    vrcErrors?: string;
    billError?: string;
    payPeriodId?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const periods = await prisma.payPeriod.findMany({
    orderBy: { cutoffDate: "asc" },
    include: {
      _count: {
        select: {
          bills: true,
          invoices: true,
        },
      },
    },
  });

  const queuedByPeriod = await prisma.invoice.groupBy({
    by: ["payPeriodId"],
    where: { status: "SUBMITTED", payPeriodId: { not: null } },
    _count: true,
  });
  const queuedCountByPeriodId = new Map(
    queuedByPeriod.map((row) => [row.payPeriodId!, row._count]),
  );

  const billedByPeriod = await prisma.invoice.groupBy({
    by: ["payPeriodId"],
    where: { status: "BILLED", payPeriodId: { not: null } },
    _count: true,
  });
  const billedCountByPeriodId = new Map(
    billedByPeriod.map((row) => [row.payPeriodId!, row._count]),
  );

  const periodRows = periods.map((period) => ({
    period,
    assignedInvoices: period._count.invoices,
    queuedInvoices: queuedCountByPeriodId.get(period.id) ?? 0,
    billedInvoices: billedCountByPeriodId.get(period.id) ?? 0,
  }));

  const syncMessage =
    params.synced === "1"
      ? `Synced ${params.total ?? "0"} pay periods from L&I (${params.created ?? "0"} new, ${params.updated ?? "0"} updated).`
      : null;

  const vrcEmailMessage =
    params.vrcEmailed === "1"
      ? `Emailed ${params.sent ?? "0"} VRC${params.sent === "1" ? "" : "s"}.`
      : null;
  const vrcSkipped = params.vrcSkipped?.split(";;").filter(Boolean) ?? [];
  const vrcErrors = params.vrcErrors?.split(";;").filter(Boolean) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Billing</h1>
        <p className="mt-2 text-sm text-muted">
          Manage pay periods, L&I procedure fees, generate 837 files, email VRCs session documentation, and view billing history.
          <strong> Assigned</strong> counts all invoices linked to each pay period.{" "}
          <strong>Generate 837</strong> uses only submitted invoices not yet on a bill — assign those on the{" "}
          <Link href="/portal/admin/invoices?status=SUBMITTED" className="text-primary hover:underline">
            Invoices
          </Link>{" "}
          page.
        </p>
      </div>

      {syncMessage && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          {syncMessage}
        </p>
      )}

      {vrcEmailMessage && (
        <div className="space-y-2">
          <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
            {vrcEmailMessage}
          </p>
          {vrcSkipped.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
              Skipped: {vrcSkipped.join(" ")}
            </p>
          )}
          {vrcErrors.length > 0 && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
              Errors: {vrcErrors.join(" ")}
            </p>
          )}
        </div>
      )}

      {params.billError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {params.billError}
        </p>
      )}

      <div className={portalCardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-primary-dark">Pay periods</h2>
            <p className="mt-0.5 text-xs text-muted">
              Sync from L&I (Bill Cutoff → cutoff, Warrant Date → expected payment) or add manually.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={syncPayPeriodsFromLniAction}>
              <button type="submit" className={portalButtonClass}>
                Sync from L&I
              </button>
            </form>
            <a
              href={LNI_PAYMENT_STATUS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={portalButtonSecondaryClass}
            >
              View on LNI.wa.gov
            </a>
          </div>
        </div>

        <form
          action={createPayPeriodAction}
          className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label htmlFor="label" className={portalLabelCompactClass}>
              Label
            </label>
            <input id="label" name="label" className={portalInputCompactClass} placeholder="June 2026" />
          </div>
          <div>
            <label htmlFor="cutoffDate" className={portalLabelCompactClass}>
              Cutoff date
            </label>
            <input id="cutoffDate" name="cutoffDate" type="date" required className={portalInputCompactClass} />
          </div>
          <div>
            <label htmlFor="paymentDate" className={portalLabelCompactClass}>
              Expected payment
            </label>
            <input id="paymentDate" name="paymentDate" type="date" className={portalInputCompactClass} />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <button type="submit" className={portalButtonSecondaryClass}>
              Add pay period
            </button>
          </div>
        </form>

        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Label</th>
              <th className="py-2 pr-4">Cutoff</th>
              <th className="py-2 pr-4">Expected payment</th>
              <th className="py-2 pr-4">837 files</th>
              <th className="py-2 pr-4">Assigned</th>
              <th className="py-2 pr-4">Submitted</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {periodRows.map(({ period, assignedInvoices, queuedInvoices, billedInvoices }) => (
              <tr key={period.id} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-4">{period.label ?? "—"}</td>
                <td className="py-2.5 pr-4">{formatDate(period.cutoffDate)}</td>
                <td className="py-2.5 pr-4">{formatDate(period.paymentDate)}</td>
                <td className="py-2.5 pr-4">{period._count.bills}</td>
                <td className="py-2.5 pr-4">{assignedInvoices}</td>
                <td className="py-2.5 pr-4">
                  {queuedInvoices > 0 ? (
                    <Link
                      href={`/portal/admin/invoices?status=SUBMITTED&payPeriodId=${period.id}`}
                      className="text-primary hover:underline"
                    >
                      {queuedInvoices}
                    </Link>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </td>
                <td className="py-2.5">
                  <div className="flex flex-wrap gap-2">
                    <Generate837Form
                      payPeriodId={period.id}
                      queuedInvoices={queuedInvoices}
                      periodLabel={period.label ?? formatDate(period.cutoffDate)}
                      generateAction={generateBillAction}
                    />
                    <form action={emailVrcsForPayPeriodAction}>
                      <input type="hidden" name="payPeriodId" value={period.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Email VRCs for all billed clients in ${period.label ?? formatDate(period.cutoffDate)}? Each VRC will receive session documentation uploaded with their client's invoice.`}
                        className={portalButtonSecondaryClass}
                        disabled={billedInvoices === 0}
                      >
                        Email VRCs
                      </ConfirmSubmitButton>
                    </form>
                    <Link
                      href={`/portal/admin/billing/${period.id}/bills`}
                      className={portalButtonSecondaryClass}
                    >
                      History
                    </Link>
                    {period._count.bills === 0 && (
                      <form action={deletePayPeriodAction}>
                        <input type="hidden" name="id" value={period.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Delete pay period ${period.label ?? formatDate(period.cutoffDate)}?`}
                          className={`${portalButtonSecondaryClass} text-red-700`}
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {periodRows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            No pay periods yet. Click <strong>Sync from L&I</strong> or add one above.
          </p>
        )}
      </div>

      <LniFeesSection />
    </div>
  );
}
