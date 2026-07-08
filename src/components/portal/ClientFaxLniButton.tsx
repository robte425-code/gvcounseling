"use client";

import { useEffect, useState, useTransition } from "react";
import { faxClientDocumentsToLniAction } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalLabelClass,
} from "@/components/portal/ui";
import {
  LNI_FAX_PRODUCTION_FORMATTED,
  LNI_FAX_TEST_FORMATTED,
} from "@/lib/lni-fax-constants";
import type { OutboundLniFaxRoute } from "@/lib/portal-settings";

type Props = {
  clientId: string;
  clientLabel: string;
  claimNumber: string;
  returnTo: string;
  hasDriveFolder: boolean;
  lniFaxRoute: OutboundLniFaxRoute;
  className?: string;
};

export function ClientFaxLniButton({
  clientId,
  clientLabel,
  claimNumber,
  returnTo,
  hasDriveFolder,
  lniFaxRoute,
  className = portalButtonSecondaryClass,
}: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeDialog() {
    if (pending) return;
    setOpen(false);
    setFiles(null);
    setError(null);
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await faxClientDocumentsToLniAction(formData);
      } catch (e) {
        // Next.js redirect throws; ignore redirect errors.
        if (e && typeof e === "object" && "digest" in e) {
          const digest = String((e as { digest?: string }).digest ?? "");
          if (digest.startsWith("NEXT_REDIRECT")) return;
        }
        setError(e instanceof Error ? e.message : "Could not send fax.");
      }
    });
  }

  const destinationLabel =
    lniFaxRoute === "lni"
      ? `L&I at ${LNI_FAX_PRODUCTION_FORMATTED}`
      : `office test line ${LNI_FAX_TEST_FORMATTED} (fax testing mode)`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasDriveFolder}
        title={
          hasDriveFolder
            ? "Fax documents to L&I"
            : "Link a Google Drive folder before faxing"
        }
        className={className}
      >
        Fax L&amp;I
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`fax-lni-${clientId}`}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={closeDialog}
            disabled={pending}
          />
          <form
            action={submit}
            className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <h2
              id={`fax-lni-${clientId}`}
              className="font-serif text-xl font-semibold text-primary-dark"
            >
              Fax L&amp;I
            </h2>
            <p className="mt-2 text-sm text-muted">
              Upload documents for {clientLabel} (claim {claimNumber}). Files are saved to this
              client&apos;s Google Drive folder under <span className="font-medium">L&amp;I Faxes</span>,
              then faxed with a cover sheet to {destinationLabel}.
            </p>

            <div className="mt-4">
              <label htmlFor={`fax-files-${clientId}`} className={portalLabelClass}>
                Files to fax <span className="text-primary">*</span>
              </label>
              <input
                id={`fax-files-${clientId}`}
                name="files"
                type="file"
                multiple
                required
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,application/pdf,image/*"
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-dark hover:file:bg-primary/15"
                onChange={(event) => setFiles(event.target.files)}
              />
              {files && files.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {Array.from(files).map((file) => (
                    <li key={`${file.name}-${file.size}`}>
                      {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {error ? (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                className={portalButtonSecondaryClass}
                disabled={pending}
              >
                Cancel
              </button>
              <button type="submit" className={portalButtonClass} disabled={pending}>
                {pending ? "Sending fax…" : "Upload & fax"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
