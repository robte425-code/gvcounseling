import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { ApplyRemittanceForm } from "@/components/portal/RemittancePayPanel";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { buildTherapistPayPreview } from "@/lib/remittance-advice";
import { prisma } from "@/lib/prisma";

function sectionLabel(section: string): string {
  switch (section) {
    case "PAID":
      return "Paid";
    case "DENIED":
      return "Denied";
    case "IN_PROCESS":
      return "In process";
    default:
      return section;
  }
}

export default async function PayRemittanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ applied?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;

  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          matchedInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              therapist: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ section: "asc" }, { claimNumber: "asc" }],
      },
      payRun: {
        include: {
          payouts: {
            include: {
              therapist: { select: { firstName: true, lastName: true } },
              lines: {
                include: {
                  invoice: {
                    select: {
                      invoiceNumber: true,
                      client: { select: { lniClaimNumber: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!remittance) notFound();

  const matchedCount = remittance.lines.filter((line) => line.matchedInvoiceId).length;
  const unmatchedCount = remittance.lines.length - matchedCount;

  const therapistPayPreview =
    remittance.status === "PREVIEW"
      ? await buildTherapistPayPreview(
          remittance.lines.map((line) => ({
            bill: {
              section: line.section,
              claimNumber: line.claimNumber,
              icn: line.icn,
              patientName: line.patientName ?? "",
              serviceProviderId: line.serviceProviderId,
              serviceProviderNpi: line.serviceProviderNpi ?? "",
              serviceProviderName: line.serviceProviderName ?? "",
              serviceLines: line.serviceLines as never,
              billTotalBilled: 0,
              billTotalAllowed: 0,
              billTotalNonCovered: 0,
              billTotalPayable: Number(line.billTotalPayable),
              eobCodes: line.eobCodes,
            },
            matchedInvoiceId: line.matchedInvoiceId,
            matchNote: line.matchNote,
            paymentStatus:
              line.section === "PAID" ? "PAID" : line.section === "DENIED" ? "DENIED" : "UNPAID",
          })),
        )
      : [];

  const therapistTotal = therapistPayPreview.reduce(
    (sum, payout) => sum + payout.therapistAmount,
    0,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/portal/admin/pay" className="text-sm text-primary hover:underline">
            ← Pay
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-primary-dark">
            RA {remittance.remittanceNumber}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Payment date {formatDate(remittance.invoiceDate)} · Warrant {remittance.warrantRegister}{" "}
            · {remittance.status === "APPLIED" ? "Applied" : "Preview"}
          </p>
        </div>
        <div className={`${portalCardClass} min-w-[10rem] px-4 py-3 shadow-none`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">L&I paid</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-primary-dark">
            {formatCurrency(Number(remittance.totalPaid))}
          </p>
        </div>
      </div>

      {query.applied === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Remittance applied. Invoice payment statuses updated and therapist pay run created.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className={`${portalCardClass} lg:col-span-8`}>
          <p className={portalSectionHeadingClass}>Bills</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
            {matchedCount} matched · {unmatchedCount} unmatched
          </h2>
          <ul className="mt-4 space-y-2">
            {remittance.lines.map((line) => (
              <li
                key={line.id}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-primary-dark">{line.claimNumber}</span>
                    <span className="mx-2 text-muted">·</span>
                    <span className="text-muted">{sectionLabel(line.section)}</span>
                    {line.matchedInvoice && (
                      <>
                        <span className="mx-2 text-muted">·</span>
                        <span>
                          Invoice #{line.matchedInvoice.invoiceNumber} (
                          {line.matchedInvoice.therapist.firstName}{" "}
                          {line.matchedInvoice.therapist.lastName})
                        </span>
                      </>
                    )}
                  </div>
                  <span className="tabular-nums font-medium">
                    {formatCurrency(Number(line.billTotalPayable))}
                  </span>
                </div>
                {line.matchNote && (
                  <p className="mt-1 text-xs text-amber-800">{line.matchNote}</p>
                )}
                {line.eobCodes.length > 0 && (
                  <p className="mt-1 text-xs text-muted">EOB: {line.eobCodes.join(", ")}</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={`${portalCardClass} lg:col-span-4`}>
          <p className={portalSectionHeadingClass}>Therapist pay</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
            {formatCurrency(therapistTotal)}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Based on therapist fee schedules for L&I-paid invoices only.
          </p>

          <ul className="mt-4 space-y-3">
            {(remittance.status === "APPLIED"
              ? remittance.payRun?.payouts.map((payout) => ({
                  therapistName: `${payout.therapist.firstName} ${payout.therapist.lastName}`,
                  therapistAmount: Number(payout.therapistAmount),
                  lniPaidAmount: Number(payout.lniPaidAmount),
                  invoiceCount: payout.invoiceCount,
                }))
              : therapistPayPreview
            )?.map((payout) => (
              <li key={payout.therapistName} className="rounded-lg bg-primary/[0.03] px-3 py-2">
                <p className="font-medium text-primary-dark">{payout.therapistName}</p>
                <p className="mt-1 text-sm tabular-nums">
                  {formatCurrency(payout.therapistAmount)}
                </p>
                <p className="text-xs text-muted">
                  {payout.invoiceCount} invoice{payout.invoiceCount === 1 ? "" : "s"} · L&I{" "}
                  {formatCurrency(payout.lniPaidAmount)}
                </p>
              </li>
            ))}
          </ul>

          {remittance.status === "PREVIEW" && (
            <div className="mt-6 border-t border-border pt-6">
              <ApplyRemittanceForm
                remittanceAdviceId={remittance.id}
                matchedCount={matchedCount}
                unmatchedCount={unmatchedCount}
                therapistTotal={therapistTotal}
              />
            </div>
          )}

          {remittance.status === "APPLIED" && (
            <p className="mt-6 text-sm text-muted">This remittance has been applied.</p>
          )}
        </section>
      </div>
    </div>
  );
}
