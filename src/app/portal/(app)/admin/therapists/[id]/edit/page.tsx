import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { TherapistForm } from "@/components/portal/TherapistForm";
import { TherapistFeesSection } from "@/components/portal/TherapistFeesSection";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import {
  deleteTherapistAction,
  deactivateTherapistAction,
  reactivateTherapistAction,
  resetTherapistPasswordAction,
} from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

export default async function EditTherapistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; passwordReset?: string; deactivated?: string; reactivated?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved, passwordReset, deactivated, reactivated } = await searchParams;

  const therapist = await prisma.user.findFirst({
    where: { id, role: "THERAPIST" },
    include: {
      googleDriveConnection: { select: { googleEmail: true } },
      _count: { select: { clients: true, invoices: true } },
    },
  });
  if (!therapist) notFound();

  const canDelete = therapist._count.invoices === 0;
  const deleteBlockedReason =
    therapist._count.invoices > 0 ? `${therapist._count.invoices} invoice(s) on record` : null;

  return (
    <div className="space-y-6">
      {saved === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Therapist saved.
        </p>
      )}
      {passwordReset === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Password reset. The therapist must change it on next login.
        </p>
      )}
      {deactivated === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Therapist deactivated. They cannot sign in; clients and Drive folders are unchanged.
        </p>
      )}
      {reactivated === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Therapist reactivated. They can sign in again.
        </p>
      )}

      <div>
        <Link href="/portal/admin/therapists" className={`${portalButtonSecondaryClass} text-xs`}>
          ← Back to therapists
        </Link>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-primary-dark">
          {therapist.lastName}, {therapist.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {therapist._count.clients} client(s) · {therapist._count.invoices} invoice(s)
          {therapist.active ? " · Active" : " · Inactive"}
          {therapist.googleDriveConnection?.googleEmail
            ? ` · Drive: ${therapist.googleDriveConnection.googleEmail}`
            : " · Drive not connected"}
        </p>
      </div>

      <TherapistForm
        mode="edit"
        therapist={therapist}
        cancelHref="/portal/admin/therapists"
      />

      <TherapistFeesSection therapistId={therapist.id} />

      <section className={`${portalCardCompactClass} space-y-3`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Account status</h2>
        {therapist.active ? (
          <>
            <p className="text-sm text-muted">
              Deactivate to block portal sign-in. Clients, invoices, and Drive folders stay as they
              are. Use delete to permanently remove an account with no billing history.
            </p>
            <form action={deactivateTherapistAction}>
              <input type="hidden" name="id" value={therapist.id} />
              <ConfirmSubmitButton
                confirmMessage={`Deactivate ${therapist.firstName} ${therapist.lastName}? They will not be able to sign in.`}
                className={portalButtonSecondaryClass}
              >
                Deactivate therapist
              </ConfirmSubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              This therapist is inactive and cannot sign in. Assigned clients are unchanged.
            </p>
            <form action={reactivateTherapistAction}>
              <input type="hidden" name="id" value={therapist.id} />
              <button type="submit" className={portalButtonClass}>
                Reactivate therapist
              </button>
            </form>
          </>
        )}
      </section>

      <section className={`${portalCardCompactClass} space-y-3`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Reset password</h2>
        <form action={resetTherapistPasswordAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={therapist.id} />
          <div className="min-w-[240px] flex-1">
            <label className={portalLabelCompactClass}>New password</label>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to auto-generate"
              className={portalInputCompactClass}
            />
          </div>
          <button type="submit" className={portalButtonSecondaryClass}>
            Reset password
          </button>
        </form>
      </section>

      <section className={`${portalCardCompactClass} space-y-3`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Delete therapist</h2>
        {canDelete ? (
          <>
            <p className="text-sm text-muted">
              Permanently removes this account. Assigned clients ({therapist._count.clients}) will
              be set to Unassigned. Any client folders in their Drive folder will be moved to New
              Referrals, then their therapist folder is deleted.
            </p>
            <form action={deleteTherapistAction}>
              <input type="hidden" name="id" value={therapist.id} />
              <ConfirmSubmitButton
                confirmMessage={`Delete ${therapist.firstName} ${therapist.lastName}? Assigned clients will be unassigned and their Drive folders moved to New Referrals.`}
                className="text-sm text-red-700 hover:underline"
              >
                Delete therapist
              </ConfirmSubmitButton>
            </form>
          </>
        ) : (
          <p className="text-sm text-muted">
            Cannot delete while {deleteBlockedReason}. Remove or reassign billing records first.
          </p>
        )}
      </section>
    </div>
  );
}
