import { requireAdmin } from "@/auth";
import { TherapistForm } from "@/components/portal/TherapistForm";

export default async function NewTherapistPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Add therapist</h1>
      <p className="text-sm text-muted">
        Email must be an @gvcounseling.com address. The therapist will be prompted to change their
        password on first login. A Google Drive folder named{" "}
        <span className="font-medium">First Last</span> is created alongside Maria and Steven&apos;s
        folders (requires system Drive connection).
      </p>
      <TherapistForm mode="create" cancelHref="/portal/admin/therapists" />
    </div>
  );
}
