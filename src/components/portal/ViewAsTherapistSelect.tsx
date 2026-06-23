"use client";

import { useRef } from "react";
import { startImpersonationAction } from "@/lib/portal-actions";
import { portalInputClass } from "@/components/portal/ui";

type TherapistOption = {
  email: string;
  firstName: string;
  lastName: string;
};

export function ViewAsTherapistSelect({ therapists }: { therapists: TherapistOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  if (!therapists.length) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">View as</span>
      <form ref={formRef} action={startImpersonationAction}>
        <label htmlFor="view-as-therapist" className="sr-only">
          View as therapist
        </label>
        <select
          id="view-as-therapist"
          name="email"
          defaultValue=""
          className={`${portalInputClass} w-auto min-w-[10rem] py-2 text-xs`}
          onChange={(e) => {
            if (e.target.value) formRef.current?.requestSubmit();
          }}
        >
          <option value="" disabled>
            Select therapist…
          </option>
          {therapists.map((t) => (
            <option key={t.email} value={t.email}>
              {t.firstName} {t.lastName}
            </option>
          ))}
        </select>
      </form>
    </div>
  );
}
