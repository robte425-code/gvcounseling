import { requireAdmin } from "@/auth";
import { TherapistForm } from "@/components/portal/TherapistForm";

export default async function NewTherapistPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Add therapist</h1>
      <p className="text-sm text-muted">New therapist accounts:</p>
      <ul className="list-inside list-disc text-sm text-muted">
        <li>Email must end with @gvcounseling.com</li>
        <li>Password must be changed on first login</li>
        <li>
          A Google Drive folder named <span className="font-medium">First Last</span> is created next
          to Maria and Steven&apos;s folders (system Drive must be connected)
        </li>
      </ul>
      <TherapistForm mode="create" cancelHref="/portal/admin/therapists" />
    </div>
  );
}
