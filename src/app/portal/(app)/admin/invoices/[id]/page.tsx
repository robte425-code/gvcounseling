import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { InvoiceDetailClient } from "@/components/portal/InvoiceDetailClient";
import { StatusBadge } from "@/components/portal/ui";
import { formatCurrency, formatDate, calendarIsoFromDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

function parseInvoiceEobDescriptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

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
            {invoice.payPeriod
              ? ` · ${invoice.payPeriod.label ?? formatDate(invoice.payPeriod.cutoffDate)}`
              : ""}
          </p>
        )}
        {invoice.paymentStatus && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={invoice.paymentStatus} />
            {invoice.lniPaidAt && <span>LNI paid {formatDate(invoice.lniPaidAt)}</span>}
          </p>
        )}
        {invoice.lniEobCodes.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-primary/[0.03] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">L&I EOB codes</p>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {invoice.lniEobCodes.map((code) => {
                const descriptions = parseInvoiceEobDescriptions(invoice.lniEobCodeDescriptions);
                return (
                  <li key={code}>
                    <span className="font-medium text-primary-dark">EOB {code}</span>
                    {descriptions[code] ? (
                      <span className="text-muted"> — {descriptions[code]}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
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
