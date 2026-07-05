import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { ApplyRemittanceForm, DeleteRemittancePreviewForm } from "@/components/portal/RemittancePayPanel";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { formatCurrency, formatCalendarIso, formatDate } from "@/lib/constants";
import { buildTherapistPayPreview } from "@/lib/remittance-advice";
import type { RemittanceServiceLine } from "@/lib/parse-lni-remittance-pdf";
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

function parseEobCodeDescriptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function formatBillServiceDate(serviceLines: unknown): string | null {
  if (!Array.isArray(serviceLines) || serviceLines.length === 0) return null;

  const dates = [
    ...new Set(
      serviceLines
        .map((line) => (line as RemittanceServiceLine).serviceDateFrom)
        .filter((date): date is string => typeof date === "string" && date.length > 0),
    ),
  ].sort();

  if (!dates.length) return null;
  if (dates.length === 1) return formatCalendarIso(dates[0]!);
  return `${formatCalendarIso(dates[0]!)} – ${formatCalendarIso(dates[dates.length - 1]!)}`;
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

  let therapistPayPreview: Awaited<ReturnType<typeof buildTherapistPayPreview>> = [];
  let therapistPayPreviewError: string | null = null;

  if (remittance.status === "PREVIEW") {
    try {
      therapistPayPreview = await buildTherapistPayPreview(
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
      );
    } catch (error) {
      therapistPayPreviewError =
        error instanceof Error ? error.message : "Could not calculate therapist pay preview.";
    }
  }

  const therapistTotal = therapistPayPreview.reduce(
    (sum, payout) => sum + payout.therapistAmount,
    0,
  );
  const eobCodeDescriptions = parseEobCodeDescriptions(remittance.eobCodeDescriptions);
  const usedEobCodes = [
    ...new Set(remittance.lines.flatMap((line) => line.eobCodes)),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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

      {remittance.status === "PREVIEW" && unmatchedCount > 0 && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span className="font-semibold">
            {unmatchedCount} unmatched bill{unmatchedCount === 1 ? "" : "s"}
          </span>
          {" — "}
          every bill must match an invoice before this remittance can be applied. Review each
          unmatched bill below and fix missing invoices or matching issues.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className={`${portalCardClass} lg:col-span-8`}>
          <p className={portalSectionHeadingClass}>Bills</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
            {matchedCount} matched · {unmatchedCount} unmatched
          </h2>
          <ul className="mt-4 space-y-2">
            {remittance.lines.map((line) => {
              const serviceDate = formatBillServiceDate(line.serviceLines);
              return (
              <li
                key={line.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  !line.matchedInvoiceId
                    ? "border-red-300 bg-red-50/50"
                    : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-primary-dark">{line.claimNumber}</span>
                    {serviceDate && (
                      <>
                        <span className="mx-2 text-muted">·</span>
                        <span>{serviceDate}</span>
                      </>
                    )}
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
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {line.eobCodes.map((code) => (
                      <li key={code}>
                        <span className="font-medium text-primary-dark">EOB {code}</span>
                        {eobCodeDescriptions[code] ? (
                          <span>: {eobCodeDescriptions[code]}</span>
                        ) : (
                          <span className="text-amber-800"> (description not available)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              );
            })}
          </ul>

          {usedEobCodes.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                EOB code reference
              </p>
              <ul className="mt-2 space-y-2">
                {usedEobCodes.map((code) => (
                  <li key={code} className="text-xs">
                    <span className="font-medium text-primary-dark">{code}</span>
                    {eobCodeDescriptions[code] ? (
                      <span className="text-muted"> — {eobCodeDescriptions[code]}</span>
                    ) : (
                      <span className="text-amber-800">
                        {" "}
                        — description not available (delete preview and re-import to load from PDF)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className={`${portalCardClass} lg:col-span-4`}>
          <p className={portalSectionHeadingClass}>Therapist pay</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
            {formatCurrency(therapistTotal)}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Based on therapist fee schedules for L&I-paid invoices only.
          </p>
          {therapistPayPreviewError && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
              {therapistPayPreviewError}
            </p>
          )}

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
            <div className="mt-6 space-y-4 border-t border-border pt-6">
              <ApplyRemittanceForm
                remittanceAdviceId={remittance.id}
                matchedCount={matchedCount}
                unmatchedCount={unmatchedCount}
                therapistTotal={therapistTotal}
              />
              <DeleteRemittancePreviewForm
                remittanceAdviceId={remittance.id}
                remittanceNumber={remittance.remittanceNumber}
                warrantRegister={remittance.warrantRegister}
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
