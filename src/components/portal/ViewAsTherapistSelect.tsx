"use client";

import { useRef } from "react";
import { startImpersonationAction } from "@/lib/portal-actions";
import { portalNavSelectClass } from "@/components/portal/ui";

type TherapistOption = {
  email: string;
  firstName: string;
  lastName: string;
};

export function ViewAsTherapistSelect({ therapists }: { therapists: TherapistOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  if (!therapists.length) return null;

  return (
    <form ref={formRef} action={startImpersonationAction} className="flex w-full items-center lg:inline-flex lg:w-auto">
      <label htmlFor="view-as-therapist" className="sr-only">
        View as therapist
      </label>
      <select
        id="view-as-therapist"
        name="email"
        defaultValue=""
        className={`${portalNavSelectClass} min-h-11 w-full min-w-0 lg:w-auto lg:min-w-[10rem]`}
        onChange={(e) => {
          if (e.target.value) formRef.current?.requestSubmit();
        }}
      >
        <option value="" disabled>
          View as…
        </option>
        {therapists.map((t) => (
          <option key={t.email} value={t.email}>
            {t.firstName} {t.lastName}
          </option>
        ))}
      </select>
    </form>
  );
}
