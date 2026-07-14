"use client";

import { useActionState } from "react";
import {
  payTherapistPayRunWithStripeAction,
  type PayStripePayRunState,
} from "@/lib/portal-actions";
import { portalButtonClass } from "@/components/portal/ui";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { formatCurrency } from "@/lib/constants";

const initial: PayStripePayRunState = {};

export function StripePayRunActions({
  remittanceAdviceId,
  payoutSummaries,
  stripeConfigured,
  stripePaidAtLabel,
  platformBalanceLabel,
}: {
  remittanceAdviceId: string;
  payoutSummaries: Array<{
    therapistName: string;
    amount: number;
    ready: boolean;
    alreadyPaid: boolean;
  }>;
  stripeConfigured: boolean;
  stripePaidAtLabel: string | null;
  platformBalanceLabel: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    payTherapistPayRunWithStripeAction,
    initial,
  );

  const pendingPay = payoutSummaries.filter((p) => p.amount > 0 && !p.alreadyPaid);
  const notReady = pendingPay.filter((p) => !p.ready);
  const total = pendingPay.reduce((sum, p) => sum + p.amount, 0);
  const canPay =
    stripeConfigured && pendingPay.length > 0 && notReady.length === 0 && !pending;

  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-primary-dark">Stripe ACH payout</p>
        <p className="mt-1 text-xs text-muted">
          Sends each therapist’s amount from your Stripe platform balance to their Connect account.
          Stripe then deposits to their bank.{" "}
          {platformBalanceLabel
            ? `Available balance: ${platformBalanceLabel}.`
            : "Add funds in Stripe Dashboard → Balances if transfers fail for insufficient balance."}
          {stripePaidAtLabel ? ` Last paid ${stripePaidAtLabel}.` : ""}
        </p>
      </div>

      <ul className="space-y-1 text-xs text-muted">
        {payoutSummaries.map((p) => (
          <li key={p.therapistName}>
            {p.therapistName}: {formatCurrency(p.amount)}
            {p.alreadyPaid
              ? " · paid"
              : p.ready
                ? " · ready"
                : " · Connect onboarding needed"}
          </li>
        ))}
      </ul>

      {!stripeConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          Set <code className="text-xs">STRIPE_SECRET_KEY</code> in Vercel to enable payouts.
        </p>
      )}

      {notReady.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          Finish Stripe Connect onboarding for:{" "}
          {notReady.map((p) => p.therapistName).join(", ")}.
        </p>
      )}

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark" role="status">
          {state.success}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
        <ConfirmSubmitButton
          confirmMessage={`Pay ${pendingPay.length} therapist${pendingPay.length === 1 ? "" : "s"} via Stripe for ${formatCurrency(total)}?\n\nThis debits your Stripe platform balance and cannot be undone from the portal.`}
          className={portalButtonClass}
          disabled={!canPay}
        >
          {pending
            ? "Paying…"
            : pendingPay.length === 0
              ? "Already paid via Stripe"
              : `Pay ${formatCurrency(total)} with Stripe`}
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
