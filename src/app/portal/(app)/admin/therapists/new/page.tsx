import { requireAdmin } from "@/auth";
import { TherapistForm } from "@/components/portal/TherapistForm";

export default async function NewTherapistPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Add therapist</h1>
      <TherapistForm mode="create" cancelHref="/portal/admin/therapists" />
    </div>
  );
}
