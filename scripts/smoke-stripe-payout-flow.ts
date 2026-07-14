#!/usr/bin/env tsx
/**
 * End-to-end Stripe therapist pay flow smoke test.
 *
 * Default: mocked Stripe + Neon DB (isolated remittance, cleaned up).
 * Live Stripe test mode: set STRIPE_SECRET_KEY=sk_test_... and STRIPE_LIVE_SMOKE=1
 *
 * Usage:
 *   set -a && source .env.smoke.local && set +a
 *   npx tsx scripts/smoke-stripe-payout-flow.ts
 */

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import path from "path";

function loadSmokeEnv() {
  const file = path.join(process.cwd(), ".env.smoke.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadSmokeEnv();

import { setStripeClientForTests } from "../src/lib/stripe";
import { payTherapistPayRunWithStripe } from "../src/lib/stripe-connect";
import { prisma } from "../src/lib/prisma";

type Status = "PASS" | "FAIL" | "SKIP";
const results: Array<{ name: string; status: Status; detail?: string }> = [];

function record(name: string, status: Status, detail?: string) {
  results.push({ name, status, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
}

function makeMockStripe(options?: {
  balanceCents?: number;
  failTransfer?: boolean;
  failCode?: string;
}) {
  const balanceCents = options?.balanceCents ?? 1_000_00;
  let transferSeq = 0;
  return {
    balance: {
      retrieve: async () => ({
        available: [{ amount: balanceCents, currency: "usd" }],
        pending: [{ amount: 0, currency: "usd" }],
      }),
    },
    transfers: {
      create: async (
        params: { amount: number; destination: string; metadata?: Record<string, string> },
        _opts?: { idempotencyKey?: string },
      ) => {
        if (options?.failTransfer) {
          const err = new Error(
            options.failCode === "balance_insufficient"
              ? "Insufficient funds in Stripe account"
              : "Stripe transfer failed",
          ) as Error & { code?: string };
          err.code = options.failCode ?? "card_error";
          throw err;
        }
        if (params.amount > balanceCents) {
          const err = new Error("Insufficient funds") as Error & { code?: string };
          err.code = "balance_insufficient";
          throw err;
        }
        transferSeq += 1;
        return {
          id: `tr_smoke_${transferSeq}_${params.destination}`,
          reversed: false,
          amount: params.amount,
          destination: params.destination,
          metadata: params.metadata ?? {},
        };
      },
    },
    accounts: {
      retrieve: async (id: string) => ({
        id,
        details_submitted: true,
        payouts_enabled: true,
      }),
    },
  } as never;
}

async function runMockedPayAndFinalizeFlow() {
  const name = "stripe/mock-pay-and-auto-finalize";
  if (!process.env.DATABASE_URL) {
    record(name, "SKIP", "DATABASE_URL not set");
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  if (!admin) {
    record(name, "SKIP", "no admin");
    return;
  }

  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST", active: true },
    orderBy: { lastName: "asc" },
    take: 2,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      stripeConnectAccountId: true,
      stripeConnectReady: true,
    },
  });
  if (therapists.length < 1) {
    record(name, "SKIP", "need at least 1 active therapist");
    return;
  }

  const smokeKey = `STRIPE-SMOKE-${Date.now()}`;
  const originals = therapists.map((t) => ({
    id: t.id,
    stripeConnectAccountId: t.stripeConnectAccountId,
    stripeConnectReady: t.stripeConnectReady,
  }));

  let remittanceId: string | null = null;

  try {
    setStripeClientForTests(makeMockStripe({ balanceCents: 50_000 }));

    for (const [i, t] of therapists.entries()) {
      await prisma.user.update({
        where: { id: t.id },
        data: {
          stripeConnectAccountId: `acct_smoke_${smokeKey}_${i}`,
          stripeConnectReady: true,
        },
      });
    }

    const remittance = await prisma.remittanceAdvice.create({
      data: {
        remittanceNumber: smokeKey,
        warrantRegister: `W-${smokeKey}`,
        invoiceDate: new Date(),
        payeeNumber: "SMOKE",
        payeeName: "Stripe Smoke Payee",
        totalPaid: 100,
        status: "APPLIED",
        importedById: admin.id,
      },
    });
    remittanceId = remittance.id;

    const payRun = await prisma.therapistPayRun.create({
      data: {
        remittanceAdviceId: remittance.id,
        status: "DRAFT",
        payouts: {
          create: therapists.map((t, i) => ({
            therapistId: t.id,
            therapistAmount: i === 0 ? 25.5 : 10,
            lniPaidAmount: i === 0 ? 50 : 20,
            invoiceCount: 1,
          })),
        },
      },
      include: { payouts: true },
    });

    const result = await payTherapistPayRunWithStripe(remittance.id);

    const refreshed = await prisma.therapistPayRun.findUnique({
      where: { id: payRun.id },
      include: { payouts: true },
    });

    const allPaid = refreshed?.payouts.every((p) => p.stripeTransferId) ?? false;
    const ok =
      result.transferredCount === therapists.length &&
      result.finalized === true &&
      refreshed?.status === "FINALIZED" &&
      refreshed.stripePaidAt != null &&
      allPaid;

    record(
      name,
      ok ? "PASS" : "FAIL",
      ok
        ? `transferred=${result.transferredCount} finalized=${result.finalized}`
        : `result=${JSON.stringify(result)} status=${refreshed?.status}`,
    );
  } catch (error) {
    record(name, "FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    setStripeClientForTests(undefined);
    if (remittanceId) {
      await prisma.remittanceAdvice.delete({ where: { id: remittanceId } }).catch(() => undefined);
    }
    for (const orig of originals) {
      await prisma.user
        .update({
          where: { id: orig.id },
          data: {
            stripeConnectAccountId: orig.stripeConnectAccountId,
            stripeConnectReady: orig.stripeConnectReady,
          },
        })
        .catch(() => undefined);
    }
  }
}

async function runInsufficientBalanceGuard() {
  const name = "stripe/mock-insufficient-balance";
  if (!process.env.DATABASE_URL) {
    record(name, "SKIP", "DATABASE_URL not set");
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  const therapist = await prisma.user.findFirst({
    where: { role: "THERAPIST", active: true },
    select: {
      id: true,
      stripeConnectAccountId: true,
      stripeConnectReady: true,
    },
  });
  if (!admin || !therapist) {
    record(name, "SKIP", "missing admin/therapist");
    return;
  }

  const smokeKey = `STRIPE-BAL-${Date.now()}`;
  const original = {
    stripeConnectAccountId: therapist.stripeConnectAccountId,
    stripeConnectReady: therapist.stripeConnectReady,
  };
  let remittanceId: string | null = null;

  try {
    setStripeClientForTests(
      makeMockStripe({ failTransfer: true, failCode: "balance_insufficient" }),
    );
    await prisma.user.update({
      where: { id: therapist.id },
      data: {
        stripeConnectAccountId: `acct_smoke_bal_${smokeKey}`,
        stripeConnectReady: true,
      },
    });

    const remittance = await prisma.remittanceAdvice.create({
      data: {
        remittanceNumber: smokeKey,
        warrantRegister: `W-${smokeKey}`,
        invoiceDate: new Date(),
        payeeNumber: "SMOKE",
        payeeName: "Stripe Balance Smoke",
        totalPaid: 10,
        status: "APPLIED",
        importedById: admin.id,
        payRun: {
          create: {
            status: "DRAFT",
            payouts: {
              create: {
                therapistId: therapist.id,
                therapistAmount: 12.34,
                lniPaidAmount: 12.34,
                invoiceCount: 1,
              },
            },
          },
        },
      },
    });
    remittanceId = remittance.id;

    try {
      await payTherapistPayRunWithStripe(remittance.id);
      record(name, "FAIL", "expected insufficient-balance error");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const payRun = await prisma.therapistPayRun.findUnique({
        where: { remittanceAdviceId: remittance.id },
      });
      const ok = /balance is too low|insufficient/i.test(msg) && payRun?.status === "DRAFT";
      record(name, ok ? "PASS" : "FAIL", msg);
    }
  } catch (error) {
    record(name, "FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    setStripeClientForTests(undefined);
    if (remittanceId) {
      await prisma.remittanceAdvice.delete({ where: { id: remittanceId } }).catch(() => undefined);
    }
    await prisma.user
      .update({
        where: { id: therapist.id },
        data: original,
      })
      .catch(() => undefined);
  }
}

async function runNotReadyGuard() {
  const name = "stripe/mock-therapist-not-ready";
  if (!process.env.DATABASE_URL) {
    record(name, "SKIP", "DATABASE_URL not set");
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  const therapist = await prisma.user.findFirst({
    where: { role: "THERAPIST", active: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      stripeConnectAccountId: true,
      stripeConnectReady: true,
    },
  });
  if (!admin || !therapist) {
    record(name, "SKIP", "missing admin/therapist");
    return;
  }

  const smokeKey = `STRIPE-READY-${Date.now()}`;
  const original = {
    stripeConnectAccountId: therapist.stripeConnectAccountId,
    stripeConnectReady: therapist.stripeConnectReady,
  };
  let remittanceId: string | null = null;

  try {
    setStripeClientForTests(makeMockStripe());
    await prisma.user.update({
      where: { id: therapist.id },
      data: { stripeConnectAccountId: null, stripeConnectReady: false },
    });

    const remittance = await prisma.remittanceAdvice.create({
      data: {
        remittanceNumber: smokeKey,
        warrantRegister: `W-${smokeKey}`,
        invoiceDate: new Date(),
        payeeNumber: "SMOKE",
        payeeName: "Stripe Ready Smoke",
        totalPaid: 10,
        status: "APPLIED",
        importedById: admin.id,
        payRun: {
          create: {
            status: "DRAFT",
            payouts: {
              create: {
                therapistId: therapist.id,
                therapistAmount: 5,
                lniPaidAmount: 5,
                invoiceCount: 1,
              },
            },
          },
        },
      },
    });
    remittanceId = remittance.id;

    try {
      await payTherapistPayRunWithStripe(remittance.id);
      record(name, "FAIL", "expected not-ready error");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record(name, /not ready for Stripe/i.test(msg) ? "PASS" : "FAIL", msg);
    }
  } catch (error) {
    record(name, "FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    setStripeClientForTests(undefined);
    if (remittanceId) {
      await prisma.remittanceAdvice.delete({ where: { id: remittanceId } }).catch(() => undefined);
    }
    await prisma.user
      .update({
        where: { id: therapist.id },
        data: original,
      })
      .catch(() => undefined);
  }
}

async function runLiveStripeSmoke() {
  const name = "stripe/live-test-mode";
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const enabled = process.env.STRIPE_LIVE_SMOKE === "1";
  if (!enabled) {
    record(name, "SKIP", "set STRIPE_LIVE_SMOKE=1 and STRIPE_SECRET_KEY=sk_test_... to run");
    return;
  }
  if (!key.startsWith("sk_test_")) {
    record(name, "SKIP", "live smoke requires sk_test_ key (refusing sk_live_)");
    return;
  }

  setStripeClientForTests(undefined);
  try {
    const { getStripe } = await import("../src/lib/stripe");
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve();
    const available =
      balance.available.find((b) => b.currency === "usd")?.amount ?? 0;
    record(
      name,
      "PASS",
      `connected to Stripe test mode; available USD cents=${available}. Full Connect Express onboarding still requires human Account Link completion.`,
    );
  } catch (error) {
    record(name, "FAIL", error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  console.log("Stripe payout flow smoke\n");
  await runNotReadyGuard();
  await runInsufficientBalanceGuard();
  await runMockedPayAndFinalizeFlow();
  await runLiveStripeSmoke();

  const failed = results.filter((r) => r.status === "FAIL").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
