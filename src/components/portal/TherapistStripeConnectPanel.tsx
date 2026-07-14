"use client";

import { useActionState } from "react";
import {
  startTherapistStripeOnboardingAction,
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
}: {
  therapistId: string;
  stripeConfigured: boolean;
  accountId: string | null;
  ready: boolean;
  flash?: "return" | "refresh" | null;
}) {
  const [onboardState, onboardAction, onboardPending] = useActionState(
    startTherapistStripeOnboardingAction,
    onboardInitial,
  );
  const [syncState, syncAction, syncPending] = useActionState(
    syncTherapistStripeConnectAction,
    syncInitial,
  );

  const statusReady = syncState.ready ?? ready;

  return (
    <section className={`${portalCardCompactClass} space-y-3`}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Stripe payouts</h2>
      <p className="text-sm text-muted">
        Therapists complete Stripe Connect Express onboarding (bank + identity). Then you can pay
        remittance run amounts from the portal. Funds come from your Stripe platform balance.
      </p>

      {!stripeConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          Stripe is not configured yet. Add <code className="text-xs">STRIPE_SECRET_KEY</code> in
          Vercel, then reopen this page.
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
        {accountId ? (
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
          <input type="hidden" name="therapistId" value={therapistId} />
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
            <input type="hidden" name="therapistId" value={therapistId} />
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
