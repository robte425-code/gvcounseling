"use client";

import { useActionState } from "react";
import {
  startSelfStripeOnboardingAction,
  startTherapistStripeOnboardingAction,
  syncSelfStripeConnectAction,
  syncTherapistStripeConnectAction,
  type StripeOnboardTherapistState,
  type SyncStripeConnectState,
} from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardCompactClass,
} from "@/components/portal/ui";

const onboardInitial: StripeOnboardTherapistState = {};
const syncInitial: SyncStripeConnectState = {};

export function TherapistStripeConnectPanel({
  therapistId,
  stripeConfigured,
  accountId,
  ready,
  flash,
  audience = "admin",
}: {
  therapistId: string;
  stripeConfigured: boolean;
  accountId: string | null;
  ready: boolean;
  flash?: "return" | "refresh" | null;
  audience?: "admin" | "therapist";
}) {
  const onboardActionFn =
    audience === "therapist"
      ? startSelfStripeOnboardingAction
      : startTherapistStripeOnboardingAction;
  const syncActionFn =
    audience === "therapist" ? syncSelfStripeConnectAction : syncTherapistStripeConnectAction;

  const [onboardState, onboardAction, onboardPending] = useActionState(
    onboardActionFn,
    onboardInitial,
  );
  const [syncState, syncAction, syncPending] = useActionState(syncActionFn, syncInitial);

  const statusReady = syncState.ready ?? ready;

  return (
    <section className={`${portalCardCompactClass} space-y-3`}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Stripe payouts</h2>
      <p className="text-sm text-muted">
        {audience === "therapist"
          ? "Connect your bank with Stripe so Grandview Counseling can deposit your remittance pay by ACH. You’ll verify your identity and banking details on Stripe’s secure form."
          : "Therapists complete Stripe Connect Express onboarding (bank + identity). Prefer they do this from Account → Settings. You can also start it here."}
      </p>

      {!stripeConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {audience === "therapist"
            ? "Stripe payouts are not available yet. Ask your admin."
            : <>
                Stripe is not configured yet. Add <code className="text-xs">STRIPE_SECRET_KEY</code>{" "}
                in Vercel, then reopen this page.
              </>}
        </p>
      )}

      {flash === "return" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark" role="status">
          Returned from Stripe. Click “Refresh status” if the ready badge hasn’t updated yet.
        </p>
      )}
      {flash === "refresh" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          Stripe onboarding link expired or was incomplete. Start onboarding again.
        </p>
      )}

      <p className="text-sm text-primary-dark">
        Status:{" "}
        <span className="font-medium">
          {!accountId
            ? "Not connected"
            : statusReady
              ? "Ready for payouts"
              : "Onboarding incomplete"}
        </span>
        {audience === "admin" && accountId ? (
          <span className="ml-2 font-mono text-xs text-muted">{accountId}</span>
        ) : null}
      </p>

      {(onboardState.error || syncState.error) && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {onboardState.error || syncState.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={onboardAction}>
          {audience === "admin" ? (
            <input type="hidden" name="therapistId" value={therapistId} />
          ) : null}
          <button
            type="submit"
            disabled={!stripeConfigured || onboardPending}
            className={portalButtonClass}
          >
            {onboardPending
              ? "Opening Stripe…"
              : accountId
                ? "Continue Stripe onboarding"
                : "Connect with Stripe"}
          </button>
        </form>
        {accountId ? (
          <form action={syncAction}>
            {audience === "admin" ? (
              <input type="hidden" name="therapistId" value={therapistId} />
            ) : null}
            <button
              type="submit"
              disabled={!stripeConfigured || syncPending}
              className={portalButtonSecondaryClass}
            >
              {syncPending ? "Refreshing…" : "Refresh status"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
