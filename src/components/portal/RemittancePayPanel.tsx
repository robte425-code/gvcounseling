"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyRemittanceAdviceAction,
  deleteRemittancePreviewAction,
  type ApplyRemittanceState,
  type DeleteRemittancePreviewState,
} from "@/lib/portal-actions";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import { portalButtonClass, portalButtonSecondaryClass, portalLabelCompactClass } from "@/components/portal/ui";

export function RemittanceImportForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/portal/remittance/import", {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as { remittanceAdviceId?: string; error?: string };

      if (!response.ok || !body.remittanceAdviceId) {
        setError(body.error ?? "Remittance import failed.");
        setLoading(false);
        return;
      }

      router.push(`/portal/admin/pay/${body.remittanceAdviceId}`);
    } catch {
      setError("Remittance import failed. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
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
          disabled={loading}
          className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-dark"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={loading} className={portalButtonClass}>
        {loading ? "Importing…" : "Import & preview"}
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

const applyInitialState: ApplyRemittanceState = {};

export function ApplyRemittanceForm({
  remittanceAdviceId,
  matchedCount,
  unmatchedCount,
  therapistTotal,
}: ApplyProps) {
  const [state, formAction, pending] = useActionState(applyRemittanceAdviceAction, applyInitialState);
  const hasUnmatched = unmatchedCount > 0;

  return (
    <form action={formAction}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      {hasUnmatched && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span className="font-semibold">
            {unmatchedCount} unmatched bill{unmatchedCount === 1 ? "" : "s"}
          </span>
          {" — "}
          every bill must match an invoice before this remittance can be applied. Review the bills
          list and resolve missing invoices or matching issues.
        </p>
      )}
      {state.error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Apply this remittance?\n\n${matchedCount} matched bill(s) will update invoice payment status (paid, denied, or in-process).\n\nTherapist pay total: $${therapistTotal.toFixed(2)} (from fee schedule on paid invoices).`}
        className={portalButtonClass}
        disabled={pending || hasUnmatched}
      >
        {pending ? "Applying…" : "Apply remittance & create pay run"}
      </ConfirmSubmitButton>
    </form>
  );
}

type DeletePreviewProps = {
  remittanceAdviceId: string;
  remittanceNumber: string;
  warrantRegister: string;
  compact?: boolean;
};

const deletePreviewInitialState: DeleteRemittancePreviewState = {};

export function DeleteRemittancePreviewForm({
  remittanceAdviceId,
  remittanceNumber,
  warrantRegister,
  compact = false,
}: DeletePreviewProps) {
  const [state, formAction, pending] = useActionState(
    deleteRemittancePreviewAction,
    deletePreviewInitialState,
  );

  return (
    <form action={formAction} className={compact ? "shrink-0" : undefined}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      {state.error && (
        <p
          className={`${compact ? "mb-2" : "mb-3"} rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800`}
          role="alert"
        >
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Delete preview for remittance ${remittanceNumber} (warrant ${warrantRegister})?\n\nYou can import the same PDF again afterward.`}
        className={
          compact
            ? `${portalButtonSecondaryClass} border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50`
            : `${portalButtonSecondaryClass} border-red-200 text-red-700 hover:bg-red-50`
        }
        disabled={pending}
      >
        {pending ? "Deleting…" : compact ? "Delete" : "Delete preview"}
      </ConfirmSubmitButton>
    </form>
  );
}
