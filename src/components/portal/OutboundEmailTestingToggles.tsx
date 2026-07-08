"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateOutboundLniFaxRouteAction,
  updateOutboundTherapistEmailRouteAction,
  updateOutboundVrcEmailRouteAction,
} from "@/lib/portal-actions";
import { LNI_FAX_PRODUCTION_FORMATTED, LNI_FAX_TEST_FORMATTED } from "@/lib/lni-fax-constants";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";
import type { OutboundEmailRoute, OutboundLniFaxRoute } from "@/lib/portal-settings";

type Props = {
  vrcRoute: OutboundEmailRoute;
  therapistRoute: OutboundEmailRoute;
  lniFaxRoute: OutboundLniFaxRoute;
  adminEmails: string[];
};

const segmentClass = (active: boolean) =>
  `rounded-full px-3.5 py-2 text-xs font-semibold transition min-h-11 sm:min-h-0 sm:py-1.5 ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

function EmailRouteToggle({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: OutboundEmailRoute;
  disabled: boolean;
  onChange: (next: OutboundEmailRoute) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-primary/[0.03] p-3">
      <div>
        <p className="text-sm font-medium text-primary-dark">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <div
        className="inline-flex w-full rounded-full border border-border bg-surface p-1 shadow-sm"
        role="group"
        aria-label={label}
      >
        <button
          type="button"
          disabled={disabled}
          className={`${segmentClass(value === "intended")} flex-1`}
          aria-pressed={value === "intended"}
          onClick={() => onChange("intended")}
        >
          Intended recipients
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`${segmentClass(value === "admin")} flex-1`}
          aria-pressed={value === "admin"}
          onClick={() => onChange("admin")}
        >
          Admins
        </button>
      </div>
    </div>
  );
}

function FaxRouteToggle({
  value,
  disabled,
  onChange,
}: {
  value: OutboundLniFaxRoute;
  disabled: boolean;
  onChange: (next: OutboundLniFaxRoute) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-primary/[0.03] p-3">
      <div>
        <p className="text-sm font-medium text-primary-dark">L&I faxes</p>
        <p className="mt-0.5 text-xs text-muted">
          {value === "test"
            ? `Routed to our fax line (${LNI_FAX_TEST_FORMATTED}).`
            : `Sent to Washington State L&I (${LNI_FAX_PRODUCTION_FORMATTED}).`}
        </p>
      </div>
      <div
        className="inline-flex w-full rounded-full border border-border bg-surface p-1 shadow-sm"
        role="group"
        aria-label="L&I fax destination"
      >
        <button
          type="button"
          disabled={disabled}
          className={`${segmentClass(value === "lni")} flex-1`}
          aria-pressed={value === "lni"}
          onClick={() => onChange("lni")}
        >
          L&I
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`${segmentClass(value === "test")} flex-1`}
          aria-pressed={value === "test"}
          onClick={() => onChange("test")}
        >
          Our fax line
        </button>
      </div>
    </div>
  );
}

export function OutboundEmailTestingToggles({
  vrcRoute,
  therapistRoute,
  lniFaxRoute,
  adminEmails,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vrcSelected, setVrcSelected] = useState(vrcRoute);
  const [therapistSelected, setTherapistSelected] = useState(therapistRoute);
  const [lniFaxSelected, setLniFaxSelected] = useState(lniFaxRoute);

  useEffect(() => {
    setVrcSelected(vrcRoute);
  }, [vrcRoute]);

  useEffect(() => {
    setTherapistSelected(therapistRoute);
  }, [therapistRoute]);

  useEffect(() => {
    setLniFaxSelected(lniFaxRoute);
  }, [lniFaxRoute]);

  function updateVrc(next: OutboundEmailRoute) {
    if (next === vrcSelected || pending) return;
    setVrcSelected(next);
    startTransition(async () => {
      await updateOutboundVrcEmailRouteAction(next);
      router.refresh();
    });
  }

  function updateTherapist(next: OutboundEmailRoute) {
    if (next === therapistSelected || pending) return;
    setTherapistSelected(next);
    startTransition(async () => {
      await updateOutboundTherapistEmailRouteAction(next);
      router.refresh();
    });
  }

  function updateLniFax(next: OutboundLniFaxRoute) {
    if (next === lniFaxSelected || pending) return;
    setLniFaxSelected(next);
    startTransition(async () => {
      await updateOutboundLniFaxRouteAction(next);
      router.refresh();
    });
  }

  const adminList = adminEmails.join(", ");

  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>Outbound testing</p>
      <p className="mt-1 text-sm text-muted">
        Redirect portal emails and faxes away from real recipients for safe testing.
      </p>

      <div className="mt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Email</p>
        <EmailRouteToggle
          label="VRC emails"
          description={
            vrcSelected === "admin"
              ? `Routed to admins (${adminList}).`
              : "Sent to each VRC address on file."
          }
          value={vrcSelected}
          disabled={pending}
          onChange={updateVrc}
        />
        <EmailRouteToggle
          label="Therapist emails"
          description={
            therapistSelected === "admin"
              ? `Routed to admins (${adminList}).`
              : "Sent to each therapist's account email."
          }
          value={therapistSelected}
          disabled={pending}
          onChange={updateTherapist}
        />

        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Fax</p>
        <FaxRouteToggle value={lniFaxSelected} disabled={pending} onChange={updateLniFax} />
      </div>
    </section>
  );
}
