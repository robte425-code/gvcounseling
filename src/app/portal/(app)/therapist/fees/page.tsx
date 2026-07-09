import { requireTherapist } from "@/auth";
import { TherapistFeesHistoryTable } from "@/components/portal/TherapistFeesHistoryTable";
import { TherapistFeesTable } from "@/components/portal/TherapistFeesTable";
import { portalCardClass } from "@/components/portal/ui";
import { loadTherapistProcedureCodeFees, serializeFeeSchedule } from "@/lib/procedure-fees";

export default async function TherapistFeesPage() {
  const session = await requireTherapist();
  const fees = await loadTherapistProcedureCodeFees(session.user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">My rates</h1>
        <p className="mt-2 text-muted">
          Your invoice rates by procedure code and effective date. These amounts are applied when you
          create invoices. Contact the admin to request fee changes.
        </p>
      </div>

      <div className={portalCardClass}>
        <h2 className="mb-4 font-serif text-xl font-semibold text-primary-dark">Current rates</h2>
        <TherapistFeesTable fees={serializeFeeSchedule(fees)} />
      </div>

      <div className={portalCardClass}>
        <h2 className="mb-4 font-serif text-xl font-semibold text-primary-dark">Rate history</h2>
        <TherapistFeesHistoryTable fees={fees} />
      </div>
    </div>
  );
}
