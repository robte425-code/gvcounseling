import Stripe from "stripe";

let stripeClient: Stripe | null = null;
let stripeClientOverride: Stripe | null | undefined;

export function isStripeConfigured(): boolean {
  if (stripeClientOverride !== undefined) return stripeClientOverride != null;
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Test-only: inject a Stripe client (or null to simulate unconfigured). Pass `undefined` to clear. */
export function setStripeClientForTests(client: Stripe | null | undefined): void {
  stripeClientOverride = client;
  stripeClient = null;
}

export function getStripe(): Stripe {
  if (stripeClientOverride !== undefined) {
    if (!stripeClientOverride) {
      throw new Error(
        "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment (Vercel).",
      );
    }
    return stripeClientOverride;
  }

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment (Vercel).",
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2025-08-27.basil",
      typescript: true,
    });
  }
  return stripeClient;
}

/** Convert dollars to Stripe integer cents. */
export function dollarsToStripeCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative number.");
  }
  return Math.round(amount * 100);
}

export function stripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}
