import { requireTherapist } from "@/auth";
import { ChangePasswordForm } from "@/components/portal/ChangePasswordForm";
import { TherapistStripeConnectPanel } from "@/components/portal/TherapistStripeConnectPanel";
import { portalCardCompactClass } from "@/components/portal/ui";
import { isStripeConfigured } from "@/lib/stripe";
import { syncTherapistStripeConnectStatus } from "@/lib/stripe-connect";
import { prisma } from "@/lib/prisma";

export default async function TherapistAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const session = await requireTherapist();
  const { stripe: stripeFlash } = await searchParams;

  let therapist = await prisma.user.findFirst({
    where: { id: session.user.id, role: "THERAPIST" },
    select: {
      id: true,
      stripeConnectAccountId: true,
      stripeConnectReady: true,
    },
  });
  if (!therapist) {
    throw new Error("Therapist account not found.");
  }

  const stripeConfigured = isStripeConfigured();
  if (stripeConfigured && therapist.stripeConnectAccountId && stripeFlash === "return") {
    try {
      await syncTherapistStripeConnectStatus(therapist.id);
      const refreshed = await prisma.user.findFirst({
        where: { id: therapist.id, role: "THERAPIST" },
        select: {
          id: true,
          stripeConnectAccountId: true,
          stripeConnectReady: true,
        },
      });
      if (refreshed) therapist = refreshed;
    } catch {
      // Keep stored status; panel allows manual refresh.
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">Account</h1>
        <p className="mt-2 text-sm text-muted">
          {session.user.firstName} {session.user.lastName} · {session.user.email}
        </p>
      </div>

      <TherapistStripeConnectPanel
        therapistId={therapist.id}
        stripeConfigured={stripeConfigured}
        accountId={therapist.stripeConnectAccountId}
        ready={therapist.stripeConnectReady}
        flash={stripeFlash === "return" || stripeFlash === "refresh" ? stripeFlash : null}
        audience="therapist"
      />

      <section className={`${portalCardCompactClass} space-y-4`}>
        <ChangePasswordForm mode="optional" cancelHref="/portal/therapist/dashboard" />
      </section>
    </div>
  );
}
