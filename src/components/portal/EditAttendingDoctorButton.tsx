"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

type Props = {
  clientId: string;
  doctorName: string | null;
};

export function EditAttendingDoctorButton({ clientId, doctorName }: Props) {
  const router = useRouter();
  const titleId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(doctorName?.trim() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setName(doctorName?.trim() ?? "");
    setError(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, doctorName]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter the attending doctor's name.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/portal/clients/${clientId}/attending-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendingDoctorName: trimmed }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save doctor name.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not save doctor name.");
    } finally {
      setSaving(false);
    }
  }

  const hasName = Boolean(doctorName?.trim());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={portalButtonSecondaryClass}
      >
        {hasName ? "Edit doctor name" : "Enter doctor name"}
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/50"
                aria-label="Close"
                onClick={() => setOpen(false)}
              />
              <form
                onSubmit={handleSubmit}
                className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl"
              >
                <h2 id={titleId} className="font-serif text-xl font-semibold text-primary-dark">
                  Attending doctor name
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Use this when the referral import could not read the doctor from an Addresses
                  &amp; Contacts file (for example a .docx).
                </p>
                <div className="mt-4">
                  <label htmlFor={inputId} className={portalLabelClass}>
                    Doctor name <span className="text-primary">*</span>
                  </label>
                  <input
                    id={inputId}
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={portalInputClass}
                    placeholder="e.g. JANE SMITH MD"
                    autoFocus
                    required
                  />
                </div>
                {error ? (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className={portalButtonSecondaryClass}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={portalButtonClass} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
