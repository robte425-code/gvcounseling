"use client";

import { useState } from "react";
import { portalButtonClass } from "@/components/portal/ui";
import type { IsaUsageIndicator } from "@/lib/edi837";

type Props = {
  payPeriodId: string;
  periodLabel: string;
  usageIndicator: IsaUsageIndicator;
  compact?: boolean;
};

export function Generate837Form({
  payPeriodId,
  periodLabel,
  usageIndicator,
  compact = false,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/portal/bills/generate?payPeriodId=${encodeURIComponent(payPeriodId)}&usageIndicator=${usageIndicator}`,
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

  const buttonClass = compact
    ? `${portalButtonClass} px-4 py-1.5 text-xs`
    : portalButtonClass;

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        title={`Generate and download an 837 for invoices assigned to ${periodLabel}`}
        className={`${buttonClass} disabled:cursor-not-allowed`}
      >
        {pending ? "Generating…" : "Generate 837"}
      </button>
      {error && (
        <p className="max-w-xs text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
