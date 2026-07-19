import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { ApplyRemittanceForm, CreateWrongYearRebillForm, CreateWrongYearRebillsForm, DeleteRemittancePreviewForm, FinalizeTherapistPayRunForm, ManualMatchRemittanceLineForm, RematchRemittanceForm, RevertAppliedRemittanceForm, SupersedeRemittanceLineForm, SupersedeWrongYearStaleLinesForm, UnmatchRemittanceLineForm, UnsupersedeRemittanceLineForm } from "@/components/portal/RemittancePayPanel";
import { StripePayRunActions } from "@/components/portal/StripePayRunActions";
import { TherapistPayoutAdjustForm } from "@/components/portal/TherapistPayoutAdjustForm";
import { RemittanceBillRow, RemittanceBillRowActions } from "@/components/portal/RemittanceBillRow";
import {
  portalCardClass,
  portalSectionHeadingClass,
  StatusBadge,
} from "@/components/portal/ui";
import { formatCurrency, formatCalendarIso, formatDate } from "@/lib/constants";
import {
  paymentStatusLabel,
  remittanceSectionToPaymentStatus,
} from "@/lib/invoice-payment-status";
import { RemittanceCrossVerifyPanel } from "@/components/portal/RemittanceCrossVerifyPanel";
import { buildTherapistPayPreview } from "@/lib/remittance-advice";
import { verifyRemittanceAgainstCounterpart } from "@/lib/remittance-cross-verify";
import { remittanceSourceFormatLabel } from "@/lib/remittance-file-format";
import {
  countUnresolvedRemittanceLines,
  listWrongYearSupersedeSuggestions,
} from "@/lib/remittance-line-supersede";
import {
  findPaidToDeniedRemittanceWarnings,
  type PaidToDeniedWarning,
} from "@/lib/remittance-paid-to-denied-warnings";
import type { RemittanceServiceLine } from "@/lib/parse-lni-remittance-pdf";
import { getStripePlatformBalanceAvailableCents } from "@/lib/stripe-connect";
import { isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

function parseEobCodeDescriptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function lineClientName(line: {
  patientName: string | null;
  matchedInvoice: {
    client: { firstName: string; lastName: string };
  } | null;
}): string | null {
  if (line.matchedInvoice?.client) {
    const { firstName, lastName } = line.matchedInvoice.client;
    return `${lastName}, ${firstName}`;
  }
  const name = line.patientName?.trim();
  return name || null;
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
  searchParams: Promise<{
    applied?: string;
    superseded?: string;
    rebilled?: string;
    finalized?: string;
    rematched?: string;
    unmatched?: string;
    matched?: string;
  }>;
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
              paymentStatus: true,
              therapist: { select: { firstName: true, lastName: true } },
              client: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ section: "asc" }, { claimNumber: "asc" }],
      },
      payRun: {
        include: {
          payouts: {
            include: {
              therapist: {
                select: {
                  firstName: true,
                  lastName: true,
                  stripeConnectAccountId: true,
                  stripeConnectReady: true,
                },
              },
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

  const stripeConfigured = isStripeConfigured();
  const platformBalanceCents = stripeConfigured
    ? await getStripePlatformBalanceAvailableCents()
    : null;

  const matchedCount = remittance.lines.filter((line) => line.matchedInvoiceId).length;
  const supersededCount = remittance.lines.filter((line) => line.supersededAt).length;
  const unresolvedCount = countUnresolvedRemittanceLines(remittance.lines);
  const wrongYearSuggestions =
    remittance.status === "PREVIEW"
      ? await listWrongYearSupersedeSuggestions(remittance.id)
      : [];
  const wrongYearSuggestionByLineId = new Map(
    wrongYearSuggestions.map((suggestion) => [suggestion.lineId, suggestion]),
  );
  const paymentStatusMismatchCount = remittance.lines.filter((line) => {
    if (!line.matchedInvoice) return false;
    const expected = remittanceSectionToPaymentStatus(line.section);
    return line.matchedInvoice.paymentStatus !== expected;
  }).length;

  let therapistPayPreview: Awaited<ReturnType<typeof buildTherapistPayPreview>> = [];
  let therapistPayPreviewError: string | null = null;

  if (remittance.status === "PREVIEW") {
    try {
      therapistPayPreview = await buildTherapistPayPreview(
        remittance.lines
          .filter((line) => !line.supersededAt)
          .map((line) => ({
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
          paymentStatus: remittanceSectionToPaymentStatus(line.section),
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
  const appliedTherapistTotal =
    remittance.payRun?.payouts.reduce((sum, payout) => sum + Number(payout.therapistAmount), 0) ??
    0;
  const finalizeTherapistTotal =
    remittance.status === "APPLIED" ? appliedTherapistTotal : therapistTotal;
  const eobCodeDescriptions = parseEobCodeDescriptions(remittance.eobCodeDescriptions);
  const usedEobCodes = [
    ...new Set(remittance.lines.flatMap((line) => line.eobCodes)),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const matchedInvoiceIds = [
    ...new Set(
      remittance.lines
        .map((line) => line.matchedInvoiceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const appliedLinesByInvoice = new Map<
    string,
    Array<{
      section: "PAID" | "DENIED" | "IN_PROCESS";
      remittanceDate: Date;
      eobCodes: string[];
      eobCodeDescriptions: unknown;
    }>
  >();

  if (remittance.status === "PREVIEW" && matchedInvoiceIds.length > 0) {
    const appliedLines = await prisma.remittanceAdviceLine.findMany({
      where: {
        matchedInvoiceId: { in: matchedInvoiceIds },
        supersededAt: null,
        remittanceAdvice: { status: "APPLIED" },
      },
      select: {
        matchedInvoiceId: true,
        section: true,
        eobCodes: true,
        eobCodeDescriptions: true,
        remittanceAdvice: { select: { invoiceDate: true } },
      },
    });

    for (const line of appliedLines) {
      if (!line.matchedInvoiceId) continue;
      const group = appliedLinesByInvoice.get(line.matchedInvoiceId) ?? [];
      group.push({
        section: line.section,
        remittanceDate: line.remittanceAdvice.invoiceDate,
        eobCodes: line.eobCodes,
        eobCodeDescriptions: line.eobCodeDescriptions,
      });
      appliedLinesByInvoice.set(line.matchedInvoiceId, group);
    }
  }

  const paidToDeniedWarnings: PaidToDeniedWarning[] =
    remittance.status === "PREVIEW"
      ? findPaidToDeniedRemittanceWarnings(remittance.lines, {
          remittanceDate: remittance.invoiceDate,
          raEobCatalog: eobCodeDescriptions,
          appliedLinesByInvoice,
        })
      : [];

  const paidToDeniedWarningByLineId = new Map(
    paidToDeniedWarnings.map((warning) => [warning.lineId, warning]),
  );

  const crossVerify = await verifyRemittanceAgainstCounterpart(remittance.id);
  const sourceLabel = remittanceSourceFormatLabel(remittance.sourceFormat);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/portal/admin/pay" className="text-sm text-primary hover:underline">
            ← Process RA
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-primary-dark">
            RA {remittance.remittanceNumber}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {sourceLabel} · Payment date {formatDate(remittance.invoiceDate)} · Warrant{" "}
            {remittance.warrantRegister} · {remittance.status === "APPLIED" ? "Applied" : "Preview"}
          </p>
        </div>
        <div className={`${portalCardClass} min-w-[10rem] px-4 py-3 shadow-none`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">L&I paid</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-primary-dark">
            {formatCurrency(Number(remittance.totalPaid))}
          </p>
        </div>
      </div>

      <RemittanceCrossVerifyPanel verify={crossVerify} currentSourceLabel={sourceLabel} />

      {query.applied === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Remittance applied. Invoice L&I statuses updated and therapist pay run created.
        </p>
      )}

      {remittance.status === "PREVIEW" && paidToDeniedWarnings.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          <span className="font-semibold">
            {paidToDeniedWarnings.length} denied bill
            {paidToDeniedWarnings.length === 1 ? "" : "s"} match previously PAID invoice
            {paidToDeniedWarnings.length === 1 ? "" : "s"}
          </span>
          {" — "}
          review before applying. EOB 309/101 duplicate denials keep the invoice PAID; other denials
          would overwrite PAID status.
        </p>
      )}

      {remittance.status === "PREVIEW" && paymentStatusMismatchCount > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <span className="font-semibold">
            {paymentStatusMismatchCount} invoice L&I status
            {paymentStatusMismatchCount === 1 ? "" : "es"} differ from L&I
          </span>
          {" — "}
          applying this remittance will update each matched invoice to the L&I status shown below.
        </p>
      )}

      {query.superseded === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Stale line(s) superseded. They no longer block applying this remittance.
        </p>
      )}

      {query.rebilled === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Rebill invoice(s) created. Submit them to L&I when ready.
        </p>
      )}

      {query.finalized === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Therapist pay finalized. Therapists were emailed and will see invoices as Paid.
        </p>
      )}

      {query.rematched === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Bills re-matched. Review matches before applying.
        </p>
      )}

      {query.unmatched === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Bill unmatched. Invoice EOB preview updated.
        </p>
      )}

      {query.matched === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Bill manually matched to invoice.
        </p>
      )}

      {remittance.status === "PREVIEW" && unresolvedCount > 0 && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span className="font-semibold">
            {unresolvedCount} unresolved bill{unresolvedCount === 1 ? "" : "s"}
          </span>
          {" — "}
          every bill must match an invoice or be superseded before this remittance can be applied.
          {wrongYearSuggestions.length > 0
            ? " Use the wrong-year supersede action below for detected stale lines."
            : " Review each unresolved bill below."}
        </p>
      )}

      {remittance.status === "PREVIEW" && wrongYearSuggestions.length > 0 && (
        <div className="space-y-3">
          <CreateWrongYearRebillsForm
            remittanceAdviceId={remittance.id}
            suggestions={wrongYearSuggestions.map((suggestion) => ({
              lineId: suggestion.lineId,
              claimNumber: suggestion.claimNumber,
              raServiceDates: suggestion.raServiceDates,
              correctedServiceDates: suggestion.correctedServiceDates,
              invoiceNumber: suggestion.invoiceNumber,
              note: suggestion.note,
            }))}
          />
          <SupersedeWrongYearStaleLinesForm
            remittanceAdviceId={remittance.id}
            suggestions={wrongYearSuggestions.map((suggestion) => ({
              lineId: suggestion.lineId,
              claimNumber: suggestion.claimNumber,
              raServiceDates: suggestion.raServiceDates,
              correctedServiceDates: suggestion.correctedServiceDates,
              invoiceNumber: suggestion.invoiceNumber,
              note: suggestion.note,
            }))}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className={`${portalCardClass} lg:col-span-8`}>
          <p className={portalSectionHeadingClass}>Bills</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
            {matchedCount} matched · {unresolvedCount} unresolved
            {supersededCount > 0 ? ` · ${supersededCount} superseded` : ""}
          </h2>
          <ul className="mt-4 space-y-2">
            {remittance.lines.map((line) => {
              const serviceDate = formatBillServiceDate(line.serviceLines);
              const clientName = lineClientName(line);
              const lniPaymentStatus = remittanceSectionToPaymentStatus(line.section);
              const invoicePaymentStatus = line.matchedInvoice?.paymentStatus ?? null;
              const paymentStatusMismatch =
                line.matchedInvoice != null && invoicePaymentStatus !== lniPaymentStatus;
              const wrongYearSuggestion = wrongYearSuggestionByLineId.get(line.id);
              const paidToDeniedWarning = paidToDeniedWarningByLineId.get(line.id);
              const isSuperseded = Boolean(line.supersededAt);
              const isUnresolved = !line.matchedInvoiceId && !isSuperseded;
              const invoiceHref = line.matchedInvoice
                ? `/portal/admin/invoices/${line.matchedInvoice.id}`
                : undefined;
              const rowClassName = isSuperseded
                ? "border-slate-200 bg-slate-50/80"
                : isUnresolved
                  ? "border-red-300 bg-red-50/50"
                  : "border-border";
              return (
              <RemittanceBillRow key={line.id} invoiceHref={invoiceHref} className={rowClassName}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-primary-dark">{line.claimNumber}</span>
                    {clientName && (
                      <>
                        <span className="mx-2 text-muted">·</span>
                        <span>{clientName}</span>
                      </>
                    )}
                    {serviceDate && (
                      <>
                        <span className="mx-2 text-muted">·</span>
                        <span>{serviceDate}</span>
                      </>
                    )}
                    <span className="mx-2 text-muted">·</span>
                    <span className="text-muted">{paymentStatusLabel(lniPaymentStatus)}</span>
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
                {paidToDeniedWarning && remittance.status === "PREVIEW" && (
                  <p className="mt-1 text-xs text-amber-900">
                    {paidToDeniedWarning.willRemainPaid
                      ? "Previously paid — duplicate denial (EOB 309/101); invoice will remain PAID (no clawback on this warrant)."
                      : "Previously paid — applying would change this invoice to DENIED."}
                    {paidToDeniedWarning.eobNote ? ` ${paidToDeniedWarning.eobNote}` : ""}
                  </p>
                )}
                {line.matchNote && (
                  <p className="mt-1 text-xs text-amber-800">{line.matchNote}</p>
                )}
                {isSuperseded && (
                  <p className="mt-1 text-xs text-slate-600">
                    Superseded stale line
                    {line.supersedeNote ? ` — ${line.supersedeNote}` : ""}
                  </p>
                )}
                {wrongYearSuggestion && remittance.status === "PREVIEW" && !isSuperseded && (
                  <p className="mt-1 text-xs text-slate-700">{wrongYearSuggestion.note}</p>
                )}
                {remittance.status === "PREVIEW" && isUnresolved && (
                  <RemittanceBillRowActions>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <ManualMatchRemittanceLineForm
                        remittanceAdviceId={remittance.id}
                        lineId={line.id}
                        claimNumber={line.claimNumber}
                      />
                      {wrongYearSuggestion && (
                        <CreateWrongYearRebillForm
                          remittanceAdviceId={remittance.id}
                          lineId={line.id}
                        />
                      )}
                      {wrongYearSuggestion ? (
                        <SupersedeRemittanceLineForm
                          remittanceAdviceId={remittance.id}
                          lineId={line.id}
                          defaultNote={wrongYearSuggestion.note}
                        />
                      ) : (
                        <SupersedeRemittanceLineForm remittanceAdviceId={remittance.id} lineId={line.id} />
                      )}
                    </div>
                  </RemittanceBillRowActions>
                )}
                {remittance.status === "PREVIEW" && line.matchedInvoice && !isSuperseded && (
                  <RemittanceBillRowActions>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <UnmatchRemittanceLineForm
                        remittanceAdviceId={remittance.id}
                        lineId={line.id}
                        invoiceNumber={line.matchedInvoice.invoiceNumber}
                      />
                      <ManualMatchRemittanceLineForm
                        remittanceAdviceId={remittance.id}
                        lineId={line.id}
                        claimNumber={line.claimNumber}
                      />
                    </div>
                  </RemittanceBillRowActions>
                )}
                {remittance.status === "PREVIEW" && isSuperseded && (
                  <RemittanceBillRowActions>
                    <UnsupersedeRemittanceLineForm remittanceAdviceId={remittance.id} lineId={line.id} />
                  </RemittanceBillRowActions>
                )}
                {line.matchedInvoice && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted">L&I:</span>
                    <StatusBadge status={lniPaymentStatus} />
                    <span className="text-muted">·</span>
                    <span className="text-muted">Invoice:</span>
                    {invoicePaymentStatus ? (
                      <StatusBadge status={invoicePaymentStatus} />
                    ) : (
                      <span className="text-muted">Not set</span>
                    )}
                    {paymentStatusMismatch && remittance.status === "PREVIEW" && (
                      <span className="text-amber-800">
                        → {paymentStatusLabel(lniPaymentStatus)} on apply
                      </span>
                    )}
                    {paymentStatusMismatch && remittance.status === "APPLIED" && (
                      <span className="text-muted">
                        Invoice uses latest remittance (PAID over IN_PROCESS over DENIED)
                      </span>
                    )}
                  </div>
                )}
                {line.eobCodes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {line.eobCodes.map((code) => {
                      const lineEobDescriptions = parseEobCodeDescriptions(line.eobCodeDescriptions);
                      const description = lineEobDescriptions[code] ?? eobCodeDescriptions[code];
                      return (
                      <li key={code}>
                        <span className="font-medium text-primary-dark">EOB {code}</span>
                        {description ? (
                          <span>: {description}</span>
                        ) : (
                          <span className="text-amber-800"> (description not available)</span>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                )}
              </RemittanceBillRow>
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
            {formatCurrency(finalizeTherapistTotal)}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Based on invoice line amounts (therapist fee schedule at submit) for L&I-paid invoices.
            After apply, you can adjust each therapist’s final paycheck amount and add a note before
            paying with Stripe.
          </p>
          {therapistPayPreviewError && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
              {therapistPayPreviewError}
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {(remittance.status === "APPLIED"
              ? remittance.payRun?.payouts.map((payout) => ({
                  payoutId: payout.id,
                  therapistName: `${payout.therapist.firstName} ${payout.therapist.lastName}`,
                  therapistAmount: Number(payout.therapistAmount),
                  computedTherapistAmount: Number(payout.computedTherapistAmount),
                  adjustmentNote: payout.adjustmentNote,
                  stripeTransferId: payout.stripeTransferId,
                  lniPaidAmount: Number(payout.lniPaidAmount),
                  invoiceCount: payout.invoiceCount,
                }))
              : therapistPayPreview?.map((payout) => ({
                  payoutId: null as string | null,
                  therapistName: payout.therapistName,
                  therapistAmount: payout.therapistAmount,
                  computedTherapistAmount: payout.therapistAmount,
                  adjustmentNote: null as string | null,
                  stripeTransferId: null as string | null,
                  lniPaidAmount: payout.lniPaidAmount,
                  invoiceCount: payout.invoiceCount,
                }))
            )?.map((payout) => {
              const adjusted =
                Math.abs(payout.therapistAmount - payout.computedTherapistAmount) > 0.001;
              const canEdit =
                remittance.status === "APPLIED" &&
                remittance.payRun?.status === "DRAFT" &&
                !payout.stripeTransferId &&
                Boolean(payout.payoutId);
              return (
              <li key={payout.therapistName} className="rounded-lg bg-primary/[0.03] px-3 py-2">
                <p className="font-medium text-primary-dark">{payout.therapistName}</p>
                <p className="mt-1 text-sm tabular-nums">
                  {formatCurrency(payout.therapistAmount)}
                  {adjusted && (
                    <span className="ml-2 text-xs font-normal text-muted">
                      (computed {formatCurrency(payout.computedTherapistAmount)})
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {payout.invoiceCount} invoice{payout.invoiceCount === 1 ? "" : "s"} · L&I{" "}
                  {formatCurrency(payout.lniPaidAmount)}
                </p>
                {payout.payoutId && (
                  <TherapistPayoutAdjustForm
                    payoutId={payout.payoutId}
                    remittanceAdviceId={remittance.id}
                    therapistName={payout.therapistName}
                    computedAmount={payout.computedTherapistAmount}
                    amount={payout.therapistAmount}
                    adjustmentNote={payout.adjustmentNote}
                    canEdit={canEdit}
                  />
                )}
              </li>
              );
            })}
          </ul>

          {remittance.status === "PREVIEW" && (
            <div className="mt-6 space-y-4 border-t border-border pt-6">
              <RematchRemittanceForm
                remittanceAdviceId={remittance.id}
                matchedCount={matchedCount}
                unresolvedCount={unresolvedCount}
              />
              <ApplyRemittanceForm
                remittanceAdviceId={remittance.id}
                matchedCount={matchedCount}
                unmatchedCount={unresolvedCount}
                therapistTotal={therapistTotal}
                paidToDeniedWarnings={paidToDeniedWarnings}
                crossVerify={crossVerify}
                sourceFormat={remittance.sourceFormat}
              />
              <DeleteRemittancePreviewForm
                remittanceAdviceId={remittance.id}
                remittanceNumber={remittance.remittanceNumber}
                warrantRegister={remittance.warrantRegister}
              />
            </div>
          )}

          {remittance.status === "APPLIED" && (
            <div className="mt-6 space-y-4 border-t border-border pt-6">
              <p className="text-sm text-muted">
                Remittance applied
                {remittance.payRun?.status === "FINALIZED"
                  ? ` · therapist pay finalized${
                      remittance.payRun.finalizedAt
                        ? ` ${formatDate(remittance.payRun.finalizedAt)}`
                        : ""
                    }`
                  : " · therapist pay draft (therapists see Pending until finalized)"}
                .
              </p>
              {remittance.payRun && remittance.payRun.payouts.length > 0 && (
                <StripePayRunActions
                  remittanceAdviceId={remittance.id}
                  payoutSummaries={remittance.payRun.payouts.map((payout) => ({
                    therapistName: `${payout.therapist.firstName} ${payout.therapist.lastName}`.trim(),
                    amount: Number(payout.therapistAmount),
                    computedAmount: Number(payout.computedTherapistAmount),
                    adjustmentNote: payout.adjustmentNote,
                    ready: Boolean(
                      payout.therapist.stripeConnectAccountId && payout.therapist.stripeConnectReady,
                    ),
                    alreadyPaid: Boolean(payout.stripeTransferId),
                  }))}
                  stripeConfigured={stripeConfigured}
                  stripePaidAtLabel={
                    remittance.payRun.stripePaidAt
                      ? formatDate(remittance.payRun.stripePaidAt)
                      : null
                  }
                  platformBalanceLabel={
                    platformBalanceCents == null
                      ? null
                      : formatCurrency(platformBalanceCents / 100)
                  }
                />
              )}
              {remittance.payRun?.status === "DRAFT" && (
                <>
                  <FinalizeTherapistPayRunForm
                    remittanceAdviceId={remittance.id}
                    therapistCount={remittance.payRun.payouts.length}
                    therapistTotal={finalizeTherapistTotal}
                  />
                  <RevertAppliedRemittanceForm
                    remittanceAdviceId={remittance.id}
                    remittanceNumber={remittance.remittanceNumber}
                    warrantRegister={remittance.warrantRegister}
                  />
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
