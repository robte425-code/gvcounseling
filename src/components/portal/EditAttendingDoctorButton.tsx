"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(doctorName?.trim() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag for portal rendering; runs once
    setMounted(true);
  }, []);

  // Seed the field when the dialog opens, and only then. Doing this in an effect that
  // also depended on `saving` meant clicking Save re-ran it and wiped what was typed.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(doctorName?.trim() ?? "");
      setError(null);
    }
  }

  // Escape must see the current `saving` without making it a dependency.
  const savingRef = useRef(saving);
  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Focus the input after paint.
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

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

  function requestClose() {
    if (saving) return;
    const initial = doctorName?.trim() ?? "";
    if (name.trim() !== initial && name.trim() !== "") {
      if (!window.confirm("Discard changes to the doctor name?")) return;
    }
    setOpen(false);
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
                onClick={requestClose}
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
                    ref={inputRef}
                    id={inputId}
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={portalInputClass}
                    placeholder="e.g. JANE SMITH MD"
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
                    onClick={requestClose}
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
