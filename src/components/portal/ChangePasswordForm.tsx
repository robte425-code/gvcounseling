"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalCardClass,
  portalCardCompactClass,
  portalInputClass,
  portalInputCompactClass,
  portalLabelClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

const initialState: ChangePasswordState = {};

type ChangePasswordFormProps = {
  embedded?: boolean;
};

export function ChangePasswordForm({ embedded = false }: ChangePasswordFormProps) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  const cardClass = embedded ? portalCardCompactClass : portalCardClass;
  const labelClass = embedded ? portalLabelCompactClass : portalLabelClass;
  const inputClass = embedded ? portalInputCompactClass : portalInputClass;

  return (
    <div className={embedded ? "space-y-3" : undefined}>
      {embedded ? (
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Password</h2>
      ) : (
        <>
          <h1 className="font-serif text-2xl font-semibold text-primary-dark">Change password</h1>
          <p className="mt-2 text-sm text-muted">Choose a new password before continuing.</p>
        </>
      )}
      <form
        action={formAction}
        className={embedded ? `${cardClass} space-y-4` : `${cardClass} mt-6 space-y-4`}
      >
        {embedded && <input type="hidden" name="returnTo" value="profile" />}
        <div>
          <label htmlFor="currentPassword" className={labelClass}>
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="newPassword" className={labelClass}>
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        {state.error && (
          <p
            className={
              embedded
                ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                : "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
            }
            role="alert"
          >
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className={embedded ? portalButtonClass : `${portalButtonClass} w-full`}
        >
          {pending ? "Saving…" : embedded ? "Update password" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
