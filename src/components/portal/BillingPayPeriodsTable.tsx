"use client";

import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { Generate837Form } from "@/components/portal/Generate837Form";
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

export function BillingPayPeriodsTable({
  rows,
  usageIndicator,
  vrcRoute,
  lniFaxRoute,
  adminEmails,
}: Props) {
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

  return (
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
                    confirmMessage={
                      vrcRoute === "admin"
                        ? `Send VRC emails for all billed clients in ${row.periodLabel}? Messages will go to admins (${adminList}) instead of each VRC.`
                        : `Email VRCs for all billed clients in ${row.periodLabel}? Each VRC will receive session documentation (excluding invoice PDFs) at their address on file.`
                    }
                    className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
                    disabled={row.billedInvoices === 0}
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
                    disabled={row.billedInvoices === 0}
                  >
                    Fax L&I
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
