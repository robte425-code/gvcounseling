"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateVrcReferralEmailDestinationAction } from "@/lib/portal-actions";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";
import type { VrcReferralEmailDestination } from "@/lib/portal-settings";

type Props = {
  destination: VrcReferralEmailDestination;
  adminEmails: string[];
};

const segmentClass = (active: boolean) =>
  `rounded-full px-3.5 py-2 text-xs font-semibold transition min-h-11 sm:min-h-0 sm:py-1.5 ${
    active ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

export function VrcReferralEmailDestinationToggle({ destination, adminEmails }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(destination);

  useEffect(() => {
    setSelected(destination);
  }, [destination]);

  function setDestination(next: VrcReferralEmailDestination) {
    if (next === selected || pending) return;
    setSelected(next);
    startTransition(async () => {
      await updateVrcReferralEmailDestinationAction(next);
      router.refresh();
    });
  }

  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>VRC referral emails</p>
      <p className="mt-1 text-sm text-muted">
        Controls where acceptance and information-request emails go for unassigned referrals.
      </p>
      <div
        className="mt-4 inline-flex w-full rounded-full border border-border bg-surface p-1 shadow-sm"
        role="group"
        aria-label="VRC referral email destination"
      >
        <button
          type="button"
          disabled={pending}
          className={`${segmentClass(selected === "vrc")} flex-1`}
          aria-pressed={selected === "vrc"}
          onClick={() => setDestination("vrc")}
        >
          VRCs
        </button>
        <button
          type="button"
          disabled={pending}
          className={`${segmentClass(selected === "admin")} flex-1`}
          aria-pressed={selected === "admin"}
          onClick={() => setDestination("admin")}
        >
          Admins (preview)
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        {selected === "vrc"
          ? "Emails go to the referring VRC on the client record."
          : `Emails go to admins (${adminEmails.join(", ")}) instead of the VRC.`}
      </p>
    </section>
  );
}
