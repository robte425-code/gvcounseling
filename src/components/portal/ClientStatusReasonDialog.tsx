"use client";

import { useEffect } from "react";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  submitLabel: string;
  formAction: (formData: FormData) => void | Promise<void>;
  clientId: string;
  returnTo?: string;
  titleId?: string;
};

export function ClientStatusReasonDialog({
  open,
  onClose,
  title,
  description,
  submitLabel,
  formAction,
  clientId,
  returnTo,
  titleId = "client-status-reason-title",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        action={formAction}
        className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <input type="hidden" name="clientId" value={clientId} />
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <h2 id={titleId} className="font-serif text-xl font-semibold text-primary-dark">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
        <div className="mt-4">
          <label htmlFor={`${titleId}-reason`} className={portalLabelClass}>
            Reason <span className="text-primary">*</span>
          </label>
          <textarea
            id={`${titleId}-reason`}
            name="reason"
            rows={4}
            required
            className={portalInputClass}
            placeholder="Please explain…"
          />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className={portalButtonSecondaryClass}>
            Cancel
          </button>
          <button type="submit" className={portalButtonClass}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
