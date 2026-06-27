import { requireAdmin } from "@/auth";
import { ClientForm } from "@/components/portal/ClientForm";

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Add client</h1>
      <ClientForm mode="admin-create" cancelHref="/portal/admin/clients" />
    </div>
  );
}
