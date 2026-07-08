"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateOutboundTherapistEmailRouteAction,
  updateOutboundVrcEmailRouteAction,
} from "@/lib/portal-actions";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";
import type { OutboundEmailRoute } from "@/lib/portal-settings";

type Props = {
  vrcRoute: OutboundEmailRoute;
  therapistRoute: OutboundEmailRoute;
  adminEmails: string[];
};

const segmentClass = (active: boolean) =>
  `rounded-full px-3.5 py-2 text-xs font-semibold transition min-h-11 sm:min-h-0 sm:py-1.5 ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

function RouteToggle({
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

export function OutboundEmailTestingToggles({
  vrcRoute,
  therapistRoute,
  adminEmails,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vrcSelected, setVrcSelected] = useState(vrcRoute);
  const [therapistSelected, setTherapistSelected] = useState(therapistRoute);

  useEffect(() => {
    setVrcSelected(vrcRoute);
  }, [vrcRoute]);

  useEffect(() => {
    setTherapistSelected(therapistRoute);
  }, [therapistRoute]);

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

  const adminList = adminEmails.join(", ");

  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>Outbound email testing</p>
      <p className="mt-1 text-sm text-muted">
        Redirect portal emails away from real VRC and therapist inboxes for safe testing. Admin
        notification emails are not redirected.
      </p>

      <div className="mt-4 space-y-3">
        <RouteToggle
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
        <RouteToggle
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
      </div>
    </section>
  );
}
