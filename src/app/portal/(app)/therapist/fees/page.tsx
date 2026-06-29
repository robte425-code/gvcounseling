import { requireTherapist } from "@/auth";
import { TherapistFeesTable } from "@/components/portal/TherapistFeesTable";
import { portalCardClass } from "@/components/portal/ui";
import { loadTherapistProcedureCodeFees, serializeFeeSchedule } from "@/lib/procedure-fees";

export default async function TherapistFeesPage() {
  const session = await requireTherapist();
  const fees = serializeFeeSchedule(await loadTherapistProcedureCodeFees(session.user.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Fees</h1>
        <p className="mt-2 text-muted">
          Your invoice rates by procedure code and effective date. These amounts are applied when you
          create invoices. Contact the admin to request fee changes.
        </p>
      </div>

      <div className={portalCardClass}>
        <TherapistFeesTable fees={fees} />
      </div>
    </div>
  );
}
