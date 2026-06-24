import Link from "next/link";
import { requireTherapist } from "@/auth";
import { createInvoiceAction } from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass, portalInputClass, portalLabelClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function NewInvoicePage() {
  const session = await requireTherapist();
  const clients = await prisma.client.findMany({
    where: { therapistId: session.user.id, assignmentStatus: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

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
        <form action={createInvoiceAction} className={`${portalCardClass} max-w-lg space-y-4`}>
          <div>
            <label htmlFor="clientId" className={portalLabelClass}>
              Client
            </label>
            <select id="clientId" name="clientId" required className={portalInputClass}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lniClaimNumber} — {c.lastName}, {c.firstName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={portalButtonClass}>
            Create draft invoice
          </button>
        </form>
      )}
    </div>
  );
}
