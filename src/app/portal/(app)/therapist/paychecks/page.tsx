import { requireTherapist } from "@/auth";
import { PaychecksTable } from "@/components/portal/PaychecksTable";
import { loadPaycheckSummaries } from "@/lib/paychecks";

export default async function TherapistPaychecksPage() {
  const session = await requireTherapist();
  const paychecks = await loadPaycheckSummaries({ therapistId: session.user.id });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Paychecks</h1>
        <p className="mt-2 text-sm text-muted">
          Your pay by L&I payment period, based on applied remittance advices.
        </p>
      </div>

      <PaychecksTable
        paychecks={paychecks}
        detailBasePath="/portal/therapist/paychecks"
        showTherapistColumn={false}
      />
    </div>
  );
}
