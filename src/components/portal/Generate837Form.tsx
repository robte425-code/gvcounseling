"use client";

import { useState } from "react";
import { portalButtonClass } from "@/components/portal/ui";

type Props = {
  payPeriodId: string;
  assignedInvoices: number;
  periodLabel: string;
};

export function Generate837Form({ payPeriodId, assignedInvoices, periodLabel }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/portal/bills/generate?payPeriodId=${encodeURIComponent(payPeriodId)}`,
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not generate 837 file.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] ?? "837.edi";

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate 837 file.");
    } finally {
      setPending(false);
    }
  }

  const label =
    assignedInvoices > 0
      ? `Generate 837 (${assignedInvoices})`
      : "Generate 837";

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        title={`Generate and download an 837 for invoices assigned to ${periodLabel}`}
        className={`${portalButtonClass} disabled:cursor-not-allowed`}
      >
        {pending ? "Generating…" : label}
      </button>
      {error && (
        <p className="max-w-xs text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
