import {
  portalCardClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

export function StripeSettings({ configured }: { configured: boolean }) {
  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>Payments</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">Stripe Connect</h2>
      <p className="mt-1 text-sm text-muted">
        Therapist remittance pay runs can be sent as ACH via Stripe Connect Express. Onboard each
        therapist on their edit page, keep a balance in Stripe (Dashboard → Balances → Add funds),
        then use <span className="font-medium">Pay with Stripe</span> on an applied remittance.
      </p>

      <p className="mt-4 text-sm text-primary-dark">
        Status:{" "}
        <span className="font-medium">
          {configured ? "API key configured" : "Not configured"}
        </span>
      </p>

      {!configured && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          In Vercel, set <code className="text-xs">STRIPE_SECRET_KEY</code> (and optionally{" "}
          <code className="text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>,{" "}
          <code className="text-xs">STRIPE_WEBHOOK_SECRET</code>). Enable Connect in your Stripe
          account and use test keys first.
        </p>
      )}

      {configured && (
        <p className="mt-3 text-xs text-muted">
          Tip: after Connect onboarding, therapists receive deposits on Stripe’s automatic payout
          schedule to the bank account they entered.
        </p>
      )}
    </section>
  );
}
