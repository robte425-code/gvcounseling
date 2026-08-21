"use client";

import { useEffect } from "react";
import Link from "next/link";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";

/**
 * Without a boundary here, any action that signals a problem by throwing —
 * "No billed invoices in this pay period", "Cannot delete a client with
 * invoices" — replaced the whole portal with a blank framework crash page and
 * stripped the message. Next hides the real text in production, so the retry
 * and the way back matter more than the detail.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">
        That didn&rsquo;t go through
      </h1>
      <p className="mt-3 text-sm text-muted">
        Nothing was saved. Try again, and if it keeps happening send the reference below to
        support so it can be traced.
      </p>

      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted">Reference: {error.digest}</p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={portalButtonClass}>
          Try again
        </button>
        <Link href="/portal" className={portalButtonSecondaryClass}>
          Back to the portal
        </Link>
      </div>
    </div>
  );
}
