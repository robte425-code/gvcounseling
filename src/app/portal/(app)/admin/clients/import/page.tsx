import Link from "next/link";
import { requireAdmin } from "@/auth";
import { ClientImportForms } from "@/components/portal/ClientImportForms";
import { prisma } from "@/lib/prisma";

export default async function ClientImportPage() {
  await requireAdmin();
  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST" },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/admin/clients" className="text-sm text-primary hover:underline">
          ← Back to clients
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">Import clients</h1>
        <p className="mt-2 text-muted">
          Upload Referral Submission documents (.docx) or a CSV with claim numbers and names.
        </p>
      </div>
      <ClientImportForms therapists={therapists} />
    </div>
  );
}
