import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth";
import { InvoiceDetailClient } from "@/components/portal/InvoiceDetailClient";
import { InvoiceLniPaymentSection } from "@/components/portal/InvoiceLniPaymentSection";
import { InvoiceNotesSection } from "@/components/portal/InvoiceNotesSection";
import { InvoiceTherapistPaymentSection } from "@/components/portal/InvoiceTherapistPaymentSection";
import { StatusBadge, portalButtonClass } from "@/components/portal/ui";
import { formatCurrency, formatDate, calendarIsoFromDate } from "@/lib/constants";
import {
  invoiceTherapistPayRunLinesInclude,
  therapistPaymentFromPayRunLines,
} from "@/lib/invoice-therapist-payment";
import {
  deleteInvoiceAction,
  unsubmitInvoiceAction,
} from "@/lib/portal-actions";
import { loadTherapistProcedureCodeFees, serializeFeeSchedule } from "@/lib/procedure-fees";
import { prisma } from "@/lib/prisma";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const invoiceDetailPath = `/portal/therapist/invoices/${id}`;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      therapist: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      ...invoiceTherapistPayRunLinesInclude,
    },
  });

  if (!invoice) notFound();
  if (session.user.role === "THERAPIST" && invoice.therapistId !== session.user.id) {
    notFound();
  }

  const therapistFees =
    session.user.role === "THERAPIST" && invoice.status === "DRAFT"
      ? serializeFeeSchedule(await loadTherapistProcedureCodeFees(invoice.therapistId))
      : undefined;

  const readOnly =
    session.user.role === "THERAPIST"
      ? invoice.status !== "DRAFT"
      : invoice.status === "BILLED";

  const lines = invoice.lineItems.map((line) => ({
    serviceDate: calendarIsoFromDate(line.serviceDate),
    procedureCode: line.procedureCode,
    amount: String(line.amount),
  }));

  const serviceDates = [
    ...new Set(invoice.lineItems.map((line) => calendarIsoFromDate(line.serviceDate))),
  ];

  const footerActions =
    session.user.role === "THERAPIST" ? (
      <>
        {invoice.status === "DRAFT" && (
          <form action={deleteInvoiceAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button type="submit" className="text-sm text-red-700 hover:underline">
              Delete draft
            </button>
          </form>
        )}
        {invoice.status === "SUBMITTED" && (
          <form action={unsubmitInvoiceAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button type="submit" className={portalButtonClass}>
              Un-submit to draft
            </button>
          </form>
        )}
      </>
    ) : null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/therapist/invoices" className="text-sm text-primary hover:underline">
          ← Invoices
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">
            Invoice #{invoice.invoiceNumber}
          </h1>
          <StatusBadge status={invoice.status} />
        </div>
        <p className="mt-2 text-muted">
          {invoice.client.lastName}, {invoice.client.firstName} · {invoice.client.lniClaimNumber} ·{" "}
          {formatCurrency(Number(invoice.totalAmount))}
        </p>
        {invoice.billedAt && (
          <p className="mt-2 text-sm text-muted">
            Billed {formatDate(invoice.billedAt)}
            {invoice.clmControlNumber ? ` · CLM ${invoice.clmControlNumber}` : ""}
          </p>
        )}
        <InvoiceLniPaymentSection
          paymentStatus={invoice.paymentStatus}
          lniPaidAt={invoice.lniPaidAt}
          lniEobCodes={invoice.lniEobCodes}
          lniEobCodeDescriptions={invoice.lniEobCodeDescriptions}
        />
        <InvoiceTherapistPaymentSection
          therapistPayment={therapistPaymentFromPayRunLines(invoice.payRunLines)}
        />
      </div>

      <InvoiceDetailClient
        invoiceId={invoice.id}
        readOnly={readOnly}
        initialLines={lines}
        therapistFeeSchedule={therapistFees}
        attachments={invoice.attachments}
        savedServiceDates={serviceDates}
        footerActions={footerActions}
      />

      <InvoiceNotesSection invoiceId={invoice.id} returnTo={invoiceDetailPath} />
    </div>
  );
}
