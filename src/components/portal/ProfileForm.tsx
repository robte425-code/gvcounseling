"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalCardCompactClass,
  portalFormGridClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

const initialState: ProfileState = {};

type ProfileFormProps = {
  email: string;
  firstName: string;
  lastName: string;
};

export function ProfileForm({ email, firstName, lastName }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className={`${portalCardCompactClass} space-y-4`}>
      <div className={portalFormGridClass}>
        <div>
          <label className={portalLabelCompactClass}>First name</label>
          <input
            name="firstName"
            required
            defaultValue={firstName}
            className={portalInputCompactClass}
          />
        </div>
        <div>
          <label className={portalLabelCompactClass}>Last name</label>
          <input
            name="lastName"
            required
            defaultValue={lastName}
            className={portalInputCompactClass}
          />
        </div>
        <div>
          <label className={portalLabelCompactClass}>Email</label>
          <input
            value={email}
            readOnly
            disabled
            className={`${portalInputCompactClass} cursor-not-allowed opacity-70`}
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={portalButtonClass}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
