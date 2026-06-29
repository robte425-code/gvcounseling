import { requireAdmin } from "@/auth";
import { TherapistForm } from "@/components/portal/TherapistForm";

export default async function NewTherapistPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Add therapist</h1>
      <p className="text-sm text-muted">
        Email must be an @gvcounseling.com address. The therapist will be prompted to change their
        password on first login.
      </p>
      <TherapistForm mode="create" cancelHref="/portal/admin/therapists" />
    </div>
  );
}
