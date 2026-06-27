import Link from "next/link";
import { requireTherapist } from "@/auth";
import { InvoiceEditor } from "@/components/portal/InvoiceEditor";
import { portalCardClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const session = await requireTherapist();
  const { clientId: preselectedClientId } = await searchParams;
  const clients = await prisma.client.findMany({
    where: { therapistId: session.user.id, assignmentStatus: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const selectedClientId =
    preselectedClientId && clients.some((c) => c.id === preselectedClientId)
      ? preselectedClientId
      : clients[0]?.id;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/therapist/invoices" className="text-sm text-primary hover:underline">
          ← Invoices
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">New invoice</h1>
      </div>
      {clients.length === 0 ? (
        <p className={portalCardClass}>
          No clients assigned to you yet. Ask the admin to add clients or import Referral Submission files.
        </p>
      ) : (
        <div className={portalCardClass}>
          <h2 className="mb-4 font-serif text-xl font-semibold text-primary-dark">Service lines</h2>
          <InvoiceEditor
            readOnly={false}
            initialLines={[]}
            clients={clients.map((c) => ({
              id: c.id,
              label: `${c.lniClaimNumber} — ${c.lastName}, ${c.firstName}`,
            }))}
            initialClientId={selectedClientId}
          />
        </div>
      )}
    </div>
  );
}
