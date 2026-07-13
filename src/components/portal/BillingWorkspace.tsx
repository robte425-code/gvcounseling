"use client";

import { useState, type ReactNode } from "react";
import { BillingPayPeriodsTable, type BillingPayPeriodRow } from "@/components/portal/BillingPayPeriodsTable";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";
import type { IsaUsageIndicator } from "@/lib/edi837";
import type { OutboundEmailRoute, OutboundLniFaxRoute } from "@/lib/portal-settings";

type Props = {
  rows: BillingPayPeriodRow[];
  defaultUsageIndicator: IsaUsageIndicator;
  vrcRoute: OutboundEmailRoute;
  lniFaxRoute: OutboundLniFaxRoute;
  adminEmails: string[];
  setup: ReactNode;
  addPayPeriod: ReactNode;
};

const segmentClass = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

type BillingEnvironment = "test" | "production";

function deriveBillingEnvironment(usageIndicator: IsaUsageIndicator): BillingEnvironment | null {
  if (usageIndicator === "T") return "test";
  if (usageIndicator === "P") return "production";
  return null;
}

function BillingModeToggles({
  usageIndicator,
  onUsageIndicatorChange,
  onBillingEnvironmentChange,
}: {
  usageIndicator: IsaUsageIndicator;
  onUsageIndicatorChange: (value: IsaUsageIndicator) => void;
  onBillingEnvironmentChange: (value: BillingEnvironment) => void;
}) {
  const billingEnvironment = deriveBillingEnvironment(usageIndicator);

  return (
    <div className="mt-6 space-y-3 border-t border-border pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Modes</p>

      <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
        <div>
          <p className="text-sm font-medium text-primary-dark">Environment</p>
          <p className="mt-0.5 text-xs text-muted">
            {billingEnvironment === "test"
              ? "Test — 837 usage indicator (T)"
              : billingEnvironment === "production"
                ? "Production — 837 usage indicator (P)"
                : "Mixed — adjust 837 mode below"}
          </p>
        </div>
        <div
          className="inline-flex w-full rounded-full border border-border bg-surface p-1 shadow-sm"
          role="group"
          aria-label="Billing environment"
        >
          <button
            type="button"
            className={`${segmentClass(billingEnvironment === "test")} flex-1`}
            aria-pressed={billingEnvironment === "test"}
            onClick={() => onBillingEnvironmentChange("test")}
          >
            Test
          </button>
          <button
            type="button"
            className={`${segmentClass(billingEnvironment === "production")} flex-1`}
            aria-pressed={billingEnvironment === "production"}
            onClick={() => onBillingEnvironmentChange("production")}
          >
            Production
          </button>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-primary/[0.03] p-3">
        <div>
          <p className="text-sm font-medium text-primary-dark">837 file</p>
          <p className="mt-0.5 text-xs text-muted">ISA15 usage indicator for downloads</p>
        </div>
        <div
          className="inline-flex w-full rounded-full border border-border bg-surface p-1 shadow-sm"
          role="group"
          aria-label="837 ISA usage indicator"
        >
          <button
            type="button"
            className={`${segmentClass(usageIndicator === "T")} flex-1`}
            aria-pressed={usageIndicator === "T"}
            onClick={() => onUsageIndicatorChange("T")}
          >
            Test (T)
          </button>
          <button
            type="button"
            className={`${segmentClass(usageIndicator === "P")} flex-1`}
            aria-pressed={usageIndicator === "P"}
            onClick={() => onUsageIndicatorChange("P")}
          >
            Production (P)
          </button>
        </div>
      </div>
    </div>
  );
}

export function BillingWorkspace({
  rows,
  defaultUsageIndicator,
  vrcRoute,
  lniFaxRoute,
  adminEmails,
  setup,
  addPayPeriod,
}: Props) {
  const [usageIndicator, setUsageIndicator] = useState<IsaUsageIndicator>(defaultUsageIndicator);

  function setBillingEnvironment(environment: BillingEnvironment) {
    setUsageIndicator(environment === "test" ? "T" : "P");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className={`${portalCardClass} lg:col-span-4`}>
        {setup}
        <BillingModeToggles
          usageIndicator={usageIndicator}
          onUsageIndicatorChange={setUsageIndicator}
          onBillingEnvironmentChange={setBillingEnvironment}
        />
        {addPayPeriod}
      </section>

      <section className={`${portalCardClass} lg:col-span-8`}>
        <p className={portalSectionHeadingClass}>837, VRC & L&I fax</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
          Generate & notify
        </h2>
        <p className="mt-1 text-xs text-muted">
          Only pay periods with assigned invoices appear here. Review batch before generating. VRC
          email and L&I fax routing are configured on the Admin page.
        </p>

        <div className="mt-5">
          <BillingPayPeriodsTable
            rows={rows}
            usageIndicator={usageIndicator}
            vrcRoute={vrcRoute}
            lniFaxRoute={lniFaxRoute}
            adminEmails={adminEmails}
          />
        </div>
      </section>
    </div>
  );
}
