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
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the server value into the toggle; primitive, so React bails when equal
    setVrcSelected(vrcRoute);
  }, [vrcRoute]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the server value into the toggle; primitive, so React bails when equal
    setTherapistSelected(therapistRoute);
  }, [therapistRoute]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the server value into the toggle; primitive, so React bails when equal
    setLniFaxSelected(lniFaxRoute);
  }, [lniFaxRoute]);

  // These decide where real patient documentation goes. Setting the toggle
  // optimistically and letting a failure pass silently left the panel asserting a
  // routing the server does not have — reading "our fax line" while production
  // faxing was live. On failure the toggle goes back and says so.
  function applyRouteChange<T>(
    next: T,
    current: T,
    setSelected: (value: T) => void,
    persist: (value: T) => Promise<unknown>,
    label: string,
  ) {
    if (next === current || pending) return;
    setSelected(next);
    setRouteError(null);
    startTransition(async () => {
      try {
        await persist(next);
        router.refresh();
      } catch (error) {
        setSelected(current);
        setRouteError(
          error instanceof Error
            ? `Could not change ${label} routing: ${error.message}`
            : `Could not change ${label} routing. It is unchanged.`,
        );
      }
    });
  }

  function updateVrc(next: OutboundEmailRoute) {
    applyRouteChange(next, vrcSelected, setVrcSelected, updateOutboundVrcEmailRouteAction, "VRC email");
  }

  function updateTherapist(next: OutboundEmailRoute) {
    applyRouteChange(
      next,
      therapistSelected,
      setTherapistSelected,
      updateOutboundTherapistEmailRouteAction,
      "therapist email",
    );
  }

  function updateLniFax(next: OutboundLniFaxRoute) {
    applyRouteChange(next, lniFaxSelected, setLniFaxSelected, updateOutboundLniFaxRouteAction, "L&I fax");
  }

  const adminList = adminEmails.join(", ");

  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>Outbound testing</p>
      <p className="mt-1 text-sm text-muted">
        Redirect portal emails and faxes away from real recipients for safe testing.
      </p>

      {routeError ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {routeError}
        </p>
      ) : null}

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
