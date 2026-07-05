import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { portalButtonClass, portalButtonSecondaryClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { getIsaUsageIndicator } from "@/lib/edi837";
import { prisma } from "@/lib/prisma";

export default async function BillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generated?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { generated } = await searchParams;

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

  const usageIndicator = getIsaUsageIndicator();

  return (
    <div className="space-y-8">
      {generated === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark">
          837 file generated successfully. Invoices are now marked as billed.
          {usageIndicator === "T" && (
            <>
              {" "}
              This file uses ISA usage indicator <strong>T</strong> (test). After L&I approves your
              test upload, set <code className="text-xs">EDI_ISA_USAGE_INDICATOR=P</code> in Vercel
              before generating production bills.
            </>
          )}
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
        </div>
        <a href={`/api/portal/bills/${bill.id}/download`} className={portalButtonClass}>
          Download 837 (.TXT)
        </a>
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
