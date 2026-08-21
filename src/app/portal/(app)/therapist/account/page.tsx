import { requireTherapist } from "@/auth";
import { ChangePasswordForm } from "@/components/portal/ChangePasswordForm";
import { portalCardCompactClass } from "@/components/portal/ui";

export default async function TherapistAccountPage() {
  const session = await requireTherapist();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">Account</h1>
        <p className="mt-2 text-sm text-muted">
          {session.user.firstName} {session.user.lastName} · {session.user.email}
        </p>
      </div>

      <section className={`${portalCardCompactClass} space-y-4`}>
        <ChangePasswordForm mode="optional" cancelHref="/portal/therapist/dashboard" />
      </section>
    </div>
  );
}
