import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { portalButtonClass, portalButtonSecondaryClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { getIsaUsageIndicator, parseIsaUsageIndicatorFromEdi } from "@/lib/edi837";
import { regenerateBillEdiAction } from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

export default async function BillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generated?: string; regenerated?: string; billError?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { generated, regenerated, billError } = await searchParams;

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      payPeriod: true,
      invoices: {
        include: { client: true, therapist: true },
        orderBy: { invoiceNumber: "asc" },
      },
    },
  });
  if (!bill) notFound();

  const currentUsageIndicator = getIsaUsageIndicator();
  const storedUsageIndicator = parseIsaUsageIndicatorFromEdi(bill.ediContent);

  return (
    <div className="space-y-8">
      {generated === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          837 file generated successfully. Invoices are now marked as billed.
          {currentUsageIndicator === "T" && (
            <>
              {" "}
              This file uses ISA usage indicator <strong>T</strong> (test).
            </>
          )}
        </p>
      )}

      {regenerated === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          837 file regenerated with current settings. ISA usage indicator is now{" "}
          <strong>{currentUsageIndicator}</strong> ({currentUsageIndicator === "T" ? "test" : "production"}
          ).
        </p>
      )}

      {billError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {billError}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/portal/admin/billing/${bill.payPeriodId}/bills`}
            className={`${portalButtonSecondaryClass} text-xs`}
          >
            ← Back to billing history
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-primary-dark">{bill.filename}</h1>
          <p className="mt-2 text-muted">
            Cutoff {formatDate(bill.payPeriod.cutoffDate)} · {bill.invoiceCount} claims ·{" "}
            {formatCurrency(Number(bill.totalAmount))}
          </p>
          <p className="mt-1 text-sm text-muted">
            File usage indicator:{" "}
            <strong>{storedUsageIndicator ?? "unknown"}</strong>
            {storedUsageIndicator && storedUsageIndicator !== currentUsageIndicator && (
              <>
                {" "}
                — current portal setting is <strong>{currentUsageIndicator}</strong>. Use Regenerate
                to update the file.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/portal/bills/${bill.id}/download`} className={portalButtonClass}>
            Download 837 (.TXT)
          </a>
          <form action={regenerateBillEdiAction}>
            <input type="hidden" name="billId" value={bill.id} />
            <button type="submit" className={portalButtonSecondaryClass}>
              Regenerate 837
            </button>
          </form>
        </div>
      </div>

      <div className={portalCardClass}>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Included invoices</h2>
        <ul className="mt-4 divide-y divide-border text-sm">
          {bill.invoices.map((inv) => (
            <li key={inv.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                #{inv.invoiceNumber} · {inv.therapist.firstName} {inv.therapist.lastName} ·{" "}
                {inv.client.lniClaimNumber} · CLM {inv.clmControlNumber}
              </span>
              <span>{formatCurrency(Number(inv.totalAmount))}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
