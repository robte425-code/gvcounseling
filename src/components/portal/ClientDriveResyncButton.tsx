"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

type ResyncResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  warnings?: string[];
  error?: string;
};

export function ClientDriveResyncButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResyncResult | null>(null);

  async function resync() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/portal/clients/${clientId}/resync-drive`, {
        method: "POST",
        credentials: "same-origin",
      });
      const body = (await res.json()) as ResyncResult;

      if (!res.ok) {
        setResult({ error: body.error ?? "Drive resync failed." });
        return;
      }

      setResult(body);
      router.refresh();
    } catch {
      setResult({ error: "Drive resync failed. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  const succeeded =
    result &&
    !result.error &&
    (result.updated === 1 || result.created === 1) &&
    !(result.errors?.length ?? 0);

  return (
    <div className={portalCardCompactClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={portalSectionHeadingClass}>Drive import</h2>
          <p className="mt-1 text-sm text-muted">
            Re-read the Referral Submission and L&I PDFs from this client&apos;s Drive folder.
          </p>
        </div>
        <button
          type="button"
          onClick={resync}
          disabled={loading}
          className={portalButtonSecondaryClass}
        >
          {loading ? "Re-syncing…" : "Re-sync from Drive"}
        </button>
      </div>

      {result?.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{result.error}</p>
      )}

      {succeeded && (
        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Client updated from Drive folder.
        </p>
      )}

      {result?.errors?.map((err) => (
        <p key={err} className="mt-2 text-sm text-red-800">
          {err}
        </p>
      ))}

      {result?.warnings?.map((warning) => (
        <p key={warning} className="mt-2 text-sm text-amber-900">
          {warning}
        </p>
      ))}

      {result?.skipped === 1 && !result.error && !(result.errors?.length ?? 0) && (
        <p className="mt-3 text-sm text-muted">No changes imported.</p>
      )}
    </div>
  );
}
