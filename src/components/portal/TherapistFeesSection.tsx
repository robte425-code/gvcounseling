import Link from "next/link";
import { TherapistCurrentFeesEditor } from "@/components/portal/TherapistCurrentFeesEditor";
import { loadTherapistProcedureCodeFees } from "@/lib/procedure-fees";
import {
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

type Props = {
  therapistId: string;
};

export async function TherapistFeesSection({ therapistId }: Props) {
  const fees = await loadTherapistProcedureCodeFees(therapistId);

  return (
    <section className={portalCardCompactClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${portalSectionHeadingClass} font-serif text-base normal-case text-primary-dark`}>
          Procedure code fees
        </h2>
        <Link
          href={`/portal/admin/therapists/${therapistId}/fees/history`}
          className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
        >
          Fee history
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted">
        Rates this therapist invoices the practice. L&I 837 billing uses the global fee schedule on
        Billing; the difference is practice margin.
      </p>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Current rates</h3>
        <div className="mt-2">
          <TherapistCurrentFeesEditor therapistId={therapistId} fees={fees} />
        </div>
      </div>
    </section>
  );
}
