"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { Generate837Form } from "@/components/portal/Generate837Form";
import { Review837BatchButton } from "@/components/portal/Review837BatchButton";
import { portalButtonSecondaryClass } from "@/components/portal/ui";
import type { IsaUsageIndicator } from "@/lib/edi837";
import {
  LNI_FAX_PRODUCTION_FORMATTED,
  LNI_FAX_TEST_FORMATTED,
} from "@/lib/lni-fax-constants";
import type { OutboundEmailRoute, OutboundLniFaxRoute } from "@/lib/portal-settings";
import { emailVrcsForPayPeriodAction, faxLniForPayPeriodAction } from "@/lib/portal-actions";

export type BillingPayPeriodRow = {
  id: string;
  label: string | null;
  cutoffLabel: string;
  paymentLabel: string;
  periodLabel: string;
  assignedInvoices: number;
  billedInvoices: number;
};

type Props = {
  rows: BillingPayPeriodRow[];
  usageIndicator: IsaUsageIndicator;
  vrcRoute: OutboundEmailRoute;
  lniFaxRoute: OutboundLniFaxRoute;
  adminEmails: string[];
};

type PeriodFilter = "awaiting" | "recent" | "all";

const RECENT_COUNT = 4;

const filterClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

function awaitingCount(row: BillingPayPeriodRow): number {
  return Math.max(0, row.assignedInvoices - row.billedInvoices);
}

function PayPeriodRow({
  row,
  usageIndicator,
  vrcRoute,
  lniFaxRoute,
  adminList,
}: {
  row: BillingPayPeriodRow;
  usageIndicator: IsaUsageIndicator;
  vrcRoute: OutboundEmailRoute;
  lniFaxRoute: OutboundLniFaxRoute;
  adminList: string;
}) {
  const unbilled = awaitingCount(row);
  const notifyReady = row.billedInvoices > 0;
  const statusLabel =
    row.billedInvoices === 0
      ? "Not billed yet"
      : unbilled === 0
        ? "Fully billed"
        : "Partially billed";

  return (
    <li className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cutoff</p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-primary-dark">
              {row.cutoffLabel}
            </h3>
            <p className="mt-1.5 text-sm text-muted">
              Expected payment {row.paymentLabel}
              {row.label ? ` · ${row.label}` : ""}
            </p>
          </div>
          <p
            className={`shrink-0 text-xs font-semibold ${
              row.billedInvoices === 0
                ? "text-amber-900"
                : unbilled === 0
                  ? "text-emerald-900"
                  : "text-primary-dark"
            }`}
          >
            {statusLabel}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Link
            href={`/portal/admin/invoices?payPeriodId=${row.id}`}
            className="rounded-lg bg-primary/[0.04] px-3 py-2.5 transition hover:bg-primary/[0.08]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Assigned</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-primary-dark">
              {row.assignedInvoices}
            </p>
          </Link>
          <div className="rounded-lg bg-primary/[0.04] px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Billed</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-primary-dark">
              {row.billedInvoices}
            </p>
          </div>
          <div className="col-span-2 rounded-lg bg-primary/[0.04] px-3 py-2.5 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Awaiting 837</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-primary-dark">{unbilled}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-2">
        <div className="border-b border-border px-4 py-4 sm:border-b-0 sm:border-r sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">1 · Generate 837</p>
          <p className="mt-1 text-xs text-muted">
            Review the batch, then download the file for L&I upload.
          </p>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <Review837BatchButton
              payPeriodId={row.id}
              periodLabel={row.periodLabel}
              usageIndicator={usageIndicator}
            />
            <Generate837Form
              payPeriodId={row.id}
              periodLabel={row.periodLabel}
              usageIndicator={usageIndicator}
              compact
            />
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">2 · Notify</p>
          <p className="mt-1 text-xs text-muted">
            {notifyReady
              ? "Send session documentation after invoices are billed."
              : "Available after at least one invoice is billed via Generate 837."}
          </p>
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <form action={emailVrcsForPayPeriodAction}>
              <input type="hidden" name="payPeriodId" value={row.id} />
              <ConfirmSubmitButton
                confirmMessage={
                  vrcRoute === "admin"
                    ? `Send VRC emails for all billed clients in ${row.periodLabel}? Messages will go to admins (${adminList}) instead of each VRC.`
                    : `Email VRCs for all billed clients in ${row.periodLabel}? Each VRC will receive session documentation (excluding invoice PDFs) at their address on file.`
                }
                className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
                disabled={!notifyReady}
              >
                Email VRCs
              </ConfirmSubmitButton>
            </form>
            <form action={faxLniForPayPeriodAction}>
              <input type="hidden" name="payPeriodId" value={row.id} />
              <ConfirmSubmitButton
                confirmMessage={
                  lniFaxRoute === "test"
                    ? `Send test L&I faxes for all billed clients in ${row.periodLabel}? All faxes (including self-insured employer copies) will go to our fax line (${LNI_FAX_TEST_FORMATTED}).`
                    : `Fax L&I for all billed clients in ${row.periodLabel}? Each client gets a cover page plus session documentation (excluding invoice PDFs) faxed to ${LNI_FAX_PRODUCTION_FORMATTED}. Self-insured clients also fax a copy to their employer.`
                }
                className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
                disabled={!notifyReady}
              >
                Fax L&I
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>
      </div>
    </li>
  );
}

export function BillingPayPeriodsTable({
  rows,
  usageIndicator,
  vrcRoute,
  lniFaxRoute,
  adminEmails,
}: Props) {
  const awaitingRows = useMemo(() => rows.filter((row) => awaitingCount(row) > 0), [rows]);
  const defaultFilter: PeriodFilter = awaitingRows.length > 0 ? "awaiting" : "recent";
  const [filter, setFilter] = useState<PeriodFilter>(defaultFilter);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-primary/[0.02] px-6 py-10 text-center">
        <p className="font-medium text-primary-dark">No pay periods ready to bill</p>
        <p className="mt-2 text-sm text-muted">
          Assign invoices on the Invoices page, or sync pay periods from L&I in the setup panel.
        </p>
      </div>
    );
  }

  const adminList = adminEmails.join(", ");
  const visibleRows =
    filter === "awaiting"
      ? awaitingRows
      : filter === "recent"
        ? rows.slice(0, RECENT_COUNT)
        : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex rounded-full border border-border bg-surface p-1 shadow-sm"
          role="group"
          aria-label="Pay period filter"
        >
          <button
            type="button"
            className={filterClass(filter === "awaiting")}
            aria-pressed={filter === "awaiting"}
            onClick={() => setFilter("awaiting")}
          >
            Awaiting ({awaitingRows.length})
          </button>
          <button
            type="button"
            className={filterClass(filter === "recent")}
            aria-pressed={filter === "recent"}
            onClick={() => setFilter("recent")}
          >
            Recent ({Math.min(RECENT_COUNT, rows.length)})
          </button>
          <button
            type="button"
            className={filterClass(filter === "all")}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All ({rows.length})
          </button>
        </div>
        <p className="text-xs text-muted">
          Showing {visibleRows.length} of {rows.length}
        </p>
      </div>

      {filter === "awaiting" && awaitingRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-primary/[0.02] px-4 py-6 text-center text-sm text-muted">
          No cutoffs currently awaiting an 837. Switch to Recent or All to browse older periods.
        </div>
      ) : (
        <ul className="max-h-[min(70vh,40rem)] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {visibleRows.map((row) => (
            <PayPeriodRow
              key={row.id}
              row={row}
              usageIndicator={usageIndicator}
              vrcRoute={vrcRoute}
              lniFaxRoute={lniFaxRoute}
              adminList={adminList}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
