import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTherapist } from "@/auth";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
  StatusBadge,
} from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";
import {
  therapistAcceptReferralAction,
  therapistRejectReferralAction,
} from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

export default async function TherapistReferralReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTherapist();
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, therapistId: session.user.id },
  });
  if (!client) notFound();

  if (client.assignmentStatus !== "PENDING_THERAPIST") {
    redirect("/portal/therapist/dashboard");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/portal/therapist/dashboard" className={`${portalButtonSecondaryClass} text-xs`}>
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">
          New client referral
        </h1>
        <p className="mt-2 text-muted">
          Review the information below and accept or decline this assignment.
        </p>
      </div>

      <div className={portalCardClass}>
        <StatusBadge status="PENDING_THERAPIST" />
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Client</dt>
            <dd className="font-medium">
              {client.lastName}, {client.firstName}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Claim #</dt>
            <dd className="font-mono">{client.lniClaimNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">Date of birth</dt>
            <dd>{formatDate(client.dateOfBirth)}</dd>
          </div>
          <div>
            <dt className="text-muted">Date of injury</dt>
            <dd>{formatDate(client.dateOfInjury)}</dd>
          </div>
          <div>
            <dt className="text-muted">VRC</dt>
            <dd>{client.vrcName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">VRC phone</dt>
            <dd>{client.vrcPhone ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Employer</dt>
            <dd>{client.employerName ?? "—"}</dd>
          </div>
          {client.clientHistory && (
            <div className="sm:col-span-2">
              <dt className="text-muted">Client history</dt>
              <dd className="whitespace-pre-wrap">{client.clientHistory}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className={`${portalCardClass} space-y-4`}>
        <form action={therapistAcceptReferralAction}>
          <input type="hidden" name="clientId" value={client.id} />
          <button type="submit" className={portalButtonClass}>
            Accept client
          </button>
        </form>

        <form action={therapistRejectReferralAction} className="space-y-3 border-t border-border pt-4">
          <input type="hidden" name="clientId" value={client.id} />
          <label htmlFor="reason" className={portalLabelClass}>
            Decline reason <span className="text-primary">*</span>
          </label>
          <textarea
            id="reason"
            name="reason"
            required
            rows={3}
            className={portalInputClass}
            placeholder="Please explain why you are declining this referral…"
          />
          <button type="submit" className={portalButtonSecondaryClass}>
            Decline referral
          </button>
        </form>
      </div>
    </div>
  );
}
