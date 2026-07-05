"use client";

import { applyRemittanceAdviceAction, importRemittanceAdviceAction } from "@/lib/portal-actions";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { portalButtonClass, portalLabelCompactClass } from "@/components/portal/ui";

export function RemittanceImportForm() {
  return (
    <form action={importRemittanceAdviceAction} className="space-y-3">
      <div>
        <label htmlFor="remittance-pdf" className={portalLabelCompactClass}>
          Remittance Advice (PDF)
        </label>
        <input
          id="remittance-pdf"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-dark"
        />
      </div>
      <button type="submit" className={portalButtonClass}>
        Import & preview
      </button>
    </form>
  );
}

type ApplyProps = {
  remittanceAdviceId: string;
  matchedCount: number;
  unmatchedCount: number;
  therapistTotal: number;
};

export function ApplyRemittanceForm({
  remittanceAdviceId,
  matchedCount,
  unmatchedCount,
  therapistTotal,
}: ApplyProps) {
  return (
    <form action={applyRemittanceAdviceAction}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <ConfirmSubmitButton
        confirmMessage={`Apply this remittance?\n\n${matchedCount} matched bill(s) will update invoice payment status (paid, denied, or in-process).\n${unmatchedCount} unmatched bill(s) will be recorded only.\n\nTherapist pay total: $${therapistTotal.toFixed(2)} (from fee schedule on paid invoices).`}
        className={portalButtonClass}
      >
        Apply remittance & create pay run
      </ConfirmSubmitButton>
    </form>
  );
}
