import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { TherapistFeesHistoryTable } from "@/components/portal/TherapistFeesHistoryTable";
import { loadTherapistProcedureCodeFees } from "@/lib/procedure-fees";
import { prisma } from "@/lib/prisma";
import { portalButtonSecondaryClass, portalCardClass } from "@/components/portal/ui";

export default async function TherapistFeeHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const therapist = await prisma.user.findFirst({
    where: { id, role: "THERAPIST" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!therapist) notFound();

  const fees = await loadTherapistProcedureCodeFees(therapist.id);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/portal/admin/therapists/${therapist.id}/edit`}
          className={`${portalButtonSecondaryClass} text-xs`}
        >
          ← Back to therapist
        </Link>
        <h1 className="mt-3 font-serif text-3xl font-semibold text-primary-dark">
          Fee history — {therapist.lastName}, {therapist.firstName}
        </h1>
        <p className="mt-2 text-muted">
          All procedure code rates for this therapist by effective date. These rates are used when
          the therapist creates invoices; L&I 837 billing uses the global schedule on Billing.
        </p>
      </div>

      <div className={portalCardClass}>
        <TherapistFeesHistoryTable fees={fees} emptyMessage="No fees on file yet for this therapist." />
      </div>
    </div>
  );
}
