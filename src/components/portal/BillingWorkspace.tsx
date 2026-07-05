"use client";

import { useState, type ReactNode } from "react";
import { BillingPayPeriodsTable, type BillingPayPeriodRow } from "@/components/portal/BillingPayPeriodsTable";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";
import type { IsaUsageIndicator } from "@/lib/edi837";
import type { VrcEmailDestination } from "@/lib/vrc-billing-emails";

type Props = {
  rows: BillingPayPeriodRow[];
  defaultUsageIndicator: IsaUsageIndicator;
  defaultVrcEmailDestination: VrcEmailDestination;
  vrcEmailTestRecipient: string;
  setup: ReactNode;
  addPayPeriod: ReactNode;
};

const segmentClass = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

function BillingModeToggles({
  usageIndicator,
  onUsageIndicatorChange,
  vrcEmailDestination,
  onVrcEmailDestinationChange,
  vrcEmailTestRecipient,
}: {
  usageIndicator: IsaUsageIndicator;
  onUsageIndicatorChange: (value: IsaUsageIndicator) => void;
  vrcEmailDestination: VrcEmailDestination;
  onVrcEmailDestinationChange: (value: VrcEmailDestination) => void;
  vrcEmailTestRecipient: string;
}) {
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Modes</p>

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

      <div className="space-y-2 rounded-xl border border-border bg-primary/[0.03] p-3">
        <div>
          <p className="text-sm font-medium text-primary-dark">VRC emails</p>
          <p className="mt-0.5 text-xs text-muted">
            {vrcEmailDestination === "test"
              ? `Test inbox — ${vrcEmailTestRecipient}`
              : "Send to each VRC address"}
          </p>
        </div>
        <div
          className="inline-flex w-full rounded-full border border-border bg-surface p-1 shadow-sm"
          role="group"
          aria-label="VRC email destination"
        >
          <button
            type="button"
            className={`${segmentClass(vrcEmailDestination === "test")} flex-1`}
            aria-pressed={vrcEmailDestination === "test"}
            onClick={() => onVrcEmailDestinationChange("test")}
          >
            Test inbox
          </button>
          <button
            type="button"
            className={`${segmentClass(vrcEmailDestination === "vrc")} flex-1`}
            aria-pressed={vrcEmailDestination === "vrc"}
            onClick={() => onVrcEmailDestinationChange("vrc")}
          >
            VRCs
          </button>
        </div>
      </div>
    </div>
  );
}

export function BillingWorkspace({
  rows,
  defaultUsageIndicator,
  defaultVrcEmailDestination,
  vrcEmailTestRecipient,
  setup,
  addPayPeriod,
}: Props) {
  const [usageIndicator, setUsageIndicator] = useState<IsaUsageIndicator>(defaultUsageIndicator);
  const [vrcEmailDestination, setVrcEmailDestination] =
    useState<VrcEmailDestination>(defaultVrcEmailDestination);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className={`${portalCardClass} lg:col-span-4`}>
        {setup}
        <BillingModeToggles
          usageIndicator={usageIndicator}
          onUsageIndicatorChange={setUsageIndicator}
          vrcEmailDestination={vrcEmailDestination}
          onVrcEmailDestinationChange={setVrcEmailDestination}
          vrcEmailTestRecipient={vrcEmailTestRecipient}
        />
        {addPayPeriod}
      </section>

      <section className={`${portalCardClass} lg:col-span-8`}>
        <p className={portalSectionHeadingClass}>837 & VRC</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
          Generate & notify
        </h2>
        <p className="mt-1 text-xs text-muted">
          Only pay periods with assigned invoices appear here. Set 837 and VRC modes in the setup
          panel before generating or emailing.
        </p>

        <div className="mt-5">
          <BillingPayPeriodsTable
            rows={rows}
            usageIndicator={usageIndicator}
            vrcEmailDestination={vrcEmailDestination}
            vrcEmailTestRecipient={vrcEmailTestRecipient}
          />
        </div>
      </section>
    </div>
  );
}
