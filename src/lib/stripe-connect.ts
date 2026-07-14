import { getSiteUrl } from "@/lib/site-url";
import { dollarsToStripeCents, getStripe } from "@/lib/stripe";
import { finalizeTherapistPayRun } from "@/lib/therapist-pay-notifications";
import { prisma } from "@/lib/prisma";

export type StripeConnectStatus = {
  configured: boolean;
  accountId: string | null;
  ready: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
};

export async function syncTherapistStripeConnectStatus(therapistId: string): Promise<StripeConnectStatus> {
  const therapist = await prisma.user.findFirst({
    where: { id: therapistId, role: "THERAPIST" },
    select: {
      id: true,
      stripeConnectAccountId: true,
      stripeConnectReady: true,
    },
  });
  if (!therapist) throw new Error("Therapist not found.");

  if (!therapist.stripeConnectAccountId) {
    return {
      configured: false,
      accountId: null,
      ready: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
    };
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(therapist.stripeConnectAccountId);
  const ready = Boolean(account.details_submitted && account.payouts_enabled);
  if (ready !== therapist.stripeConnectReady) {
    await prisma.user.update({
      where: { id: therapist.id },
      data: { stripeConnectReady: ready },
    });
  }

  return {
    configured: true,
    accountId: therapist.stripeConnectAccountId,
    ready,
    detailsSubmitted: Boolean(account.details_submitted),
    payoutsEnabled: Boolean(account.payouts_enabled),
  };
}

/** Create (or reuse) an Express connected account and return a Stripe-hosted onboarding URL. */
export async function createTherapistStripeOnboardingLink(
  therapistId: string,
  options?: { returnAudience?: "admin" | "therapist" },
): Promise<{
  url: string;
  accountId: string;
}> {
  const therapist = await prisma.user.findFirst({
    where: { id: therapistId, role: "THERAPIST" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      stripeConnectAccountId: true,
    },
  });
  if (!therapist) throw new Error("Therapist not found.");

  const stripe = getStripe();
  let accountId = therapist.stripeConnectAccountId;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: therapist.email,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
      },
      individual: {
        first_name: therapist.firstName,
        last_name: therapist.lastName,
        email: therapist.email,
      },
      metadata: {
        therapistId: therapist.id,
        portal: "gvcounseling",
      },
    });
    accountId = account.id;
    await prisma.user.update({
      where: { id: therapist.id },
      data: {
        stripeConnectAccountId: accountId,
        stripeConnectReady: false,
      },
    });
  }

  const siteUrl = getSiteUrl();
  const audience = options?.returnAudience ?? "admin";
  const basePath =
    audience === "therapist"
      ? `${siteUrl}/portal/therapist/account`
      : `${siteUrl}/portal/admin/therapists/${therapist.id}/edit`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${basePath}?stripe=refresh`,
    return_url: `${basePath}?stripe=return`,
    type: "account_onboarding",
  });

  if (!link.url) throw new Error("Stripe did not return an onboarding URL.");
  return { url: link.url, accountId };
}

export type StripePayRunResult = {
  transferredCount: number;
  skippedCount: number;
  totalCents: number;
  finalized: boolean;
  transfers: Array<{
    payoutId: string;
    therapistName: string;
    amount: number;
    transferId: string;
    status: string;
  }>;
};

/**
 * Transfer each therapist payout from the platform Stripe balance to their
 * Connect Express account. Requires funds available in the platform balance
 * (Dashboard → Balances → Add funds / top-up).
 */
export async function payTherapistPayRunWithStripe(remittanceAdviceId: string): Promise<StripePayRunResult> {
  const remittance = await prisma.remittanceAdvice.findUnique({
    where: { id: remittanceAdviceId },
    include: {
      payRun: {
        include: {
          payouts: {
            include: {
              therapist: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  stripeConnectAccountId: true,
                  stripeConnectReady: true,
                },
              },
            },
            orderBy: { therapist: { lastName: "asc" } },
          },
        },
      },
    },
  });

  if (!remittance) throw new Error("Remittance advice not found.");
  if (remittance.status !== "APPLIED") {
    throw new Error("Only applied remittances can be paid with Stripe.");
  }
  if (!remittance.payRun) throw new Error("No therapist pay run for this remittance.");

  const payRun = remittance.payRun;
  const stripe = getStripe();
  const transfers: StripePayRunResult["transfers"] = [];
  let transferredCount = 0;
  let skippedCount = 0;
  let totalCents = 0;
  const now = new Date();

  for (const payout of payRun.payouts) {
    const amount = Number(payout.therapistAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      skippedCount += 1;
      continue;
    }

    if (payout.stripeTransferId) {
      skippedCount += 1;
      continue;
    }

    const therapist = payout.therapist;
    if (!therapist.stripeConnectAccountId || !therapist.stripeConnectReady) {
      throw new Error(
        `${therapist.firstName} ${therapist.lastName} is not ready for Stripe payouts. Complete Connect onboarding on their therapist page first.`,
      );
    }

    const cents = dollarsToStripeCents(amount);
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: cents,
          currency: "usd",
          destination: therapist.stripeConnectAccountId,
          transfer_group: payRun.id,
          description: `GV Counseling therapist pay — RA ${remittance.remittanceNumber}`,
          metadata: {
            remittanceAdviceId: remittance.id,
            remittanceNumber: remittance.remittanceNumber,
            payRunId: payRun.id,
            payoutId: payout.id,
            therapistId: therapist.id,
          },
        },
        { idempotencyKey: `therapist-payout-${payout.id}` },
      );

      await prisma.therapistPayRunPayout.update({
        where: { id: payout.id },
        data: {
          stripeTransferId: transfer.id,
          stripeTransferStatus: transfer.reversed ? "reversed" : "paid",
          stripePaidAt: now,
        },
      });

      transferredCount += 1;
      totalCents += cents;
      transfers.push({
        payoutId: payout.id,
        therapistName: `${therapist.firstName} ${therapist.lastName}`.trim(),
        amount,
        transferId: transfer.id,
        status: "paid",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe transfer failed.";
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "balance_insufficient" || /insufficient/i.test(message)) {
        throw new Error(
          "Stripe platform balance is too low. Add funds in Stripe Dashboard → Balances (ACH top-up), wait until available, then try again.",
        );
      }
      throw new Error(
        `Could not pay ${therapist.firstName} ${therapist.lastName}: ${message}`,
      );
    }
  }

  if (transferredCount === 0 && skippedCount === payRun.payouts.length) {
    const alreadyPaid = payRun.payouts.every(
      (p) => p.stripeTransferId || Number(p.therapistAmount) <= 0,
    );
    if (alreadyPaid) {
      throw new Error("This pay run was already paid through Stripe (or has no positive amounts).");
    }
  }

  if (transferredCount > 0) {
    await prisma.therapistPayRun.update({
      where: { id: payRun.id },
      data: { stripePaidAt: now },
    });
  }

  const paidPayoutIds = new Set([
    ...payRun.payouts.filter((p) => p.stripeTransferId).map((p) => p.id),
    ...transfers.map((t) => t.payoutId),
  ]);
  const allPositivePaid = payRun.payouts.every((payout) => {
    const amount = Number(payout.therapistAmount);
    if (!Number.isFinite(amount) || amount <= 0) return true;
    return paidPayoutIds.has(payout.id);
  });

  let finalized = payRun.status === "FINALIZED";
  if (transferredCount > 0 && allPositivePaid && payRun.status !== "FINALIZED") {
    await finalizeTherapistPayRun(remittanceAdviceId);
    finalized = true;
  }

  return { transferredCount, skippedCount, totalCents, transfers, finalized };
}

export async function getStripePlatformBalanceAvailableCents(): Promise<number | null> {
  try {
    const balance = await getStripe().balance.retrieve();
    const usd = balance.available.find((b) => b.currency === "usd");
    return usd?.amount ?? 0;
  } catch {
    return null;
  }
}
