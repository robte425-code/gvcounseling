import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { InvoiceDetailClient } from "@/components/portal/InvoiceDetailClient";
import { StatusBadge } from "@/components/portal/ui";
import { formatCurrency, formatDate, calendarIsoFromDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      therapist: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      bill: { include: { payPeriod: true } },
      payPeriod: true,
    },
  });

  if (!invoice) notFound();

  const lines = invoice.lineItems.map((line) => ({
    serviceDate: calendarIsoFromDate(line.serviceDate),
    procedureCode: line.procedureCode,
    amount: String(line.amount),
  }));

  const serviceDates = [
    ...new Set(invoice.lineItems.map((line) => calendarIsoFromDate(line.serviceDate))),
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/admin/invoices" className="text-sm text-primary hover:underline">
          ← Invoices
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">
            Invoice #{invoice.invoiceNumber}
          </h1>
          <StatusBadge status={invoice.status} />
        </div>
        <p className="mt-2 text-muted">
          {invoice.therapist.firstName} {invoice.therapist.lastName} · {invoice.client.lastName},{" "}
          {invoice.client.firstName} · {invoice.client.lniClaimNumber} ·{" "}
          {formatCurrency(Number(invoice.totalAmount))}
        </p>
        {invoice.submittedAt && (
          <p className="mt-2 text-sm text-muted">Submitted {formatDate(invoice.submittedAt)}</p>
        )}
        {invoice.billedAt && (
          <p className="mt-2 text-sm text-muted">
            Billed {formatDate(invoice.billedAt)}
            {invoice.clmControlNumber ? ` · CLM ${invoice.clmControlNumber}` : ""}
            {invoice.bill?.payPeriod
              ? ` · ${invoice.bill.payPeriod.label ?? formatDate(invoice.bill.payPeriod.cutoffDate)}`
              : ""}
          </p>
        )}
        {invoice.status === "SUBMITTED" && invoice.payPeriod && (
          <p className="mt-2 text-sm text-muted">
            Assigned to pay period{" "}
            {invoice.payPeriod.label ?? formatDate(invoice.payPeriod.cutoffDate)}
          </p>
        )}
      </div>

      <InvoiceDetailClient
        invoiceId={invoice.id}
        readOnly
        initialLines={lines}
        attachments={invoice.attachments}
        savedServiceDates={serviceDates}
      />
    </div>
  );
}
