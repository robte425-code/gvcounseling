"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createTherapistAction,
  updateTherapistAction,
  type TherapistFormState,
} from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalFormGridClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

export type TherapistFormTherapist = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lniProviderId: string | null;
  npi: string | null;
};

type TherapistFormProps = {
  therapist?: TherapistFormTherapist;
  mode: "create" | "edit";
  cancelHref: string;
};

const initialCreateState: TherapistFormState = {};

export function TherapistForm({ therapist, mode, cancelHref }: TherapistFormProps) {
  const [createState, createAction, createPending] = useActionState(
    createTherapistAction,
    initialCreateState,
  );

  if (mode === "edit") {
    return (
      <form action={updateTherapistAction} className={`${portalCardCompactClass} space-y-4`}>
        {therapist && <input type="hidden" name="id" value={therapist.id} />}
        <TherapistFields therapist={therapist} mode={mode} />
        <FormActions mode={mode} pending={false} cancelHref={cancelHref} />
      </form>
    );
  }

  return (
    <form action={createAction} className={`${portalCardCompactClass} space-y-4`}>
      <TherapistFields therapist={therapist} mode={mode} />
      {createState.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {createState.error}
        </p>
      )}
      <FormActions mode={mode} pending={createPending} cancelHref={cancelHref} />
    </form>
  );
}

function TherapistFields({
  therapist,
  mode,
}: {
  therapist?: TherapistFormTherapist;
  mode: "create" | "edit";
}) {
  return (
    <div className={portalFormGridClass}>
      <div>
        <label className={portalLabelCompactClass}>First name</label>
        <input
          name="firstName"
          required
          defaultValue={therapist?.firstName ?? ""}
          className={portalInputCompactClass}
        />
      </div>
      <div>
        <label className={portalLabelCompactClass}>Last name</label>
        <input
          name="lastName"
          required
          defaultValue={therapist?.lastName ?? ""}
          className={portalInputCompactClass}
        />
      </div>
      <div>
        <label className={portalLabelCompactClass}>Email</label>
        <input
          name="email"
          type="email"
          required
          defaultValue={therapist?.email ?? ""}
          placeholder="name@gvcounseling.com"
          className={portalInputCompactClass}
        />
      </div>
      <div>
        <label className={portalLabelCompactClass}>L&I provider ID</label>
        <input
          name="lniProviderId"
          defaultValue={therapist?.lniProviderId ?? ""}
          className={portalInputCompactClass}
        />
      </div>
      <div>
        <label className={portalLabelCompactClass}>NPI</label>
        <input
          name="npi"
          defaultValue={therapist?.npi ?? ""}
          className={portalInputCompactClass}
        />
      </div>
      {mode === "create" && (
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={portalLabelCompactClass}>Initial password</label>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to auto-generate"
            className={portalInputCompactClass}
          />
          <p className="mt-1 text-xs text-muted">
            Therapist must change password on first login. Share the password securely if you set one
            manually.
          </p>
        </div>
      )}
    </div>
  );
}

function FormActions({
  mode,
  pending,
  cancelHref,
}: {
  mode: "create" | "edit";
  pending: boolean;
  cancelHref: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={pending} className={portalButtonClass}>
        {pending ? "Saving…" : mode === "create" ? "Add therapist" : "Save changes"}
      </button>
      <Link href={cancelHref} className={portalButtonSecondaryClass}>
        Cancel
      </Link>
    </div>
  );
}
