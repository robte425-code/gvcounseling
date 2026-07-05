"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { Generate837Form } from "@/components/portal/Generate837Form";
import { portalButtonSecondaryClass } from "@/components/portal/ui";
import type { IsaUsageIndicator } from "@/lib/edi837";
import { emailVrcsForPayPeriodAction } from "@/lib/portal-actions";

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
  defaultUsageIndicator: IsaUsageIndicator;
};

const segmentClass = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

export function BillingPayPeriodsTable({ rows, defaultUsageIndicator }: Props) {
  const [usageIndicator, setUsageIndicator] = useState<IsaUsageIndicator>(defaultUsageIndicator);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-primary/[0.03] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-primary-dark">837 file mode</p>
          <p className="mt-0.5 text-xs text-muted">ISA15 usage indicator for downloads</p>
        </div>
        <div
          className="inline-flex rounded-full border border-border bg-surface p-1 shadow-sm"
          role="group"
          aria-label="837 ISA usage indicator"
        >
          <button
            type="button"
            className={segmentClass(usageIndicator === "T")}
            aria-pressed={usageIndicator === "T"}
            onClick={() => setUsageIndicator("T")}
          >
            Test (T)
          </button>
          <button
            type="button"
            className={segmentClass(usageIndicator === "P")}
            aria-pressed={usageIndicator === "P"}
            onClick={() => setUsageIndicator("P")}
          >
            Production (P)
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary/20"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg font-semibold text-primary-dark">
                  {row.label ?? row.cutoffLabel}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full bg-muted/10 px-2.5 py-0.5 text-xs text-muted">
                    Cutoff {row.cutoffLabel}
                  </span>
                  <span className="inline-flex rounded-full bg-muted/10 px-2.5 py-0.5 text-xs text-muted">
                    Payment {row.paymentLabel}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                <div className="text-center">
                  <Link
                    href={`/portal/admin/invoices?payPeriodId=${row.id}`}
                    className="text-2xl font-semibold tabular-nums text-primary hover:underline"
                  >
                    {row.assignedInvoices}
                  </Link>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Assigned</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Generate837Form
                    payPeriodId={row.id}
                    periodLabel={row.periodLabel}
                    usageIndicator={usageIndicator}
                    compact
                  />
                  <form action={emailVrcsForPayPeriodAction}>
                    <input type="hidden" name="payPeriodId" value={row.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Email VRCs for all billed clients in ${row.periodLabel}? Each VRC will receive a notification email with the session date(s).`}
                      className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
                      disabled={row.billedInvoices === 0}
                    >
                      Email VRCs
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
