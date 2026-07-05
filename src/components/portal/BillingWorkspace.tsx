"use client";

import { useState, type ReactNode } from "react";
import { BillingPayPeriodsTable, type BillingPayPeriodRow } from "@/components/portal/BillingPayPeriodsTable";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";
import type { IsaUsageIndicator } from "@/lib/edi837";
import type { VrcEmailDestination } from "@/lib/vrc-billing-emails";
import type { LniFaxDestination } from "@/lib/lni-fax-constants";
import { LNI_FAX_TEST_FORMATTED } from "@/lib/lni-fax-constants";

type Props = {
  rows: BillingPayPeriodRow[];
  defaultUsageIndicator: IsaUsageIndicator;
  defaultVrcEmailDestination: VrcEmailDestination;
  defaultLniFaxDestination: LniFaxDestination;
  vrcEmailTestRecipient: string;
  setup: ReactNode;
  addPayPeriod: ReactNode;
};

const segmentClass = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

type BillingEnvironment = "test" | "production";

function deriveBillingEnvironment(
  usageIndicator: IsaUsageIndicator,
  vrcEmailDestination: VrcEmailDestination,
  lniFaxDestination: LniFaxDestination,
): BillingEnvironment | null {
  const allTest =
    usageIndicator === "T" && vrcEmailDestination === "test" && lniFaxDestination === "test";
  const allProduction =
    usageIndicator === "P" && vrcEmailDestination === "vrc" && lniFaxDestination === "lni";

  if (allTest) return "test";
  if (allProduction) return "production";
  return null;
}

function BillingModeToggles({
  usageIndicator,
  onUsageIndicatorChange,
  vrcEmailDestination,
  onVrcEmailDestinationChange,
  lniFaxDestination,
  onLniFaxDestinationChange,
  onBillingEnvironmentChange,
  vrcEmailTestRecipient,
}: {
  usageIndicator: IsaUsageIndicator;
  onUsageIndicatorChange: (value: IsaUsageIndicator) => void;
  vrcEmailDestination: VrcEmailDestination;
  onVrcEmailDestinationChange: (value: VrcEmailDestination) => void;
  lniFaxDestination: LniFaxDestination;
  onLniFaxDestinationChange: (value: LniFaxDestination) => void;
  onBillingEnvironmentChange: (value: BillingEnvironment) => void;
  vrcEmailTestRecipient: string;
}) {
  const billingEnvironment = deriveBillingEnvironment(
    usageIndicator,
    vrcEmailDestination,
    lniFaxDestination,
  );

  return (
    <div className="mt-6 space-y-3 border-t border-border pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Modes</p>

      <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
        <div>
          <p className="text-sm font-medium text-primary-dark">Environment</p>
          <p className="mt-0.5 text-xs text-muted">
            {billingEnvironment === "test"
              ? "Test — 837 (T), VRC test inbox, test fax"
              : billingEnvironment === "production"
                ? "Production — 837 (P), VRC addresses, L&I fax"
                : "Mixed — individual modes differ below"}
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

      <div className="space-y-2 rounded-xl border border-border bg-primary/[0.03] p-3">
        <div>
          <p className="text-sm font-medium text-primary-dark">Fax L&I</p>
          <p className="mt-0.5 text-xs text-muted">
            {lniFaxDestination === "test"
              ? `Test fax — ${LNI_FAX_TEST_FORMATTED}`
              : "Send to L&I (360-902-4567)"}
          </p>
        </div>
        <div
          className="inline-flex w-full rounded-full border border-border bg-surface p-1 shadow-sm"
          role="group"
          aria-label="L&I fax destination"
        >
          <button
            type="button"
            className={`${segmentClass(lniFaxDestination === "test")} flex-1`}
            aria-pressed={lniFaxDestination === "test"}
            onClick={() => onLniFaxDestinationChange("test")}
          >
            Test fax
          </button>
          <button
            type="button"
            className={`${segmentClass(lniFaxDestination === "lni")} flex-1`}
            aria-pressed={lniFaxDestination === "lni"}
            onClick={() => onLniFaxDestinationChange("lni")}
          >
            L&I
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
  defaultLniFaxDestination,
  vrcEmailTestRecipient,
  setup,
  addPayPeriod,
}: Props) {
  const [usageIndicator, setUsageIndicator] = useState<IsaUsageIndicator>(defaultUsageIndicator);
  const [vrcEmailDestination, setVrcEmailDestination] =
    useState<VrcEmailDestination>(defaultVrcEmailDestination);
  const [lniFaxDestination, setLniFaxDestination] =
    useState<LniFaxDestination>(defaultLniFaxDestination);

  function setBillingEnvironment(environment: BillingEnvironment) {
    if (environment === "test") {
      setUsageIndicator("T");
      setVrcEmailDestination("test");
      setLniFaxDestination("test");
      return;
    }

    setUsageIndicator("P");
    setVrcEmailDestination("vrc");
    setLniFaxDestination("lni");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className={`${portalCardClass} lg:col-span-4`}>
        {setup}
        <BillingModeToggles
          usageIndicator={usageIndicator}
          onUsageIndicatorChange={setUsageIndicator}
          vrcEmailDestination={vrcEmailDestination}
          onVrcEmailDestinationChange={setVrcEmailDestination}
          lniFaxDestination={lniFaxDestination}
          onLniFaxDestinationChange={setLniFaxDestination}
          onBillingEnvironmentChange={setBillingEnvironment}
          vrcEmailTestRecipient={vrcEmailTestRecipient}
        />
        {addPayPeriod}
      </section>

      <section className={`${portalCardClass} lg:col-span-8`}>
        <p className={portalSectionHeadingClass}>837, VRC & L&I fax</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
          Generate & notify
        </h2>
        <p className="mt-1 text-xs text-muted">
          Only pay periods with assigned invoices appear here. Use Environment in the setup panel
          to switch all modes at once, or adjust 837, VRC, and L&I fax individually.
        </p>

        <div className="mt-5">
          <BillingPayPeriodsTable
            rows={rows}
            usageIndicator={usageIndicator}
            vrcEmailDestination={vrcEmailDestination}
            lniFaxDestination={lniFaxDestination}
            vrcEmailTestRecipient={vrcEmailTestRecipient}
          />
        </div>
      </section>
    </div>
  );
}
