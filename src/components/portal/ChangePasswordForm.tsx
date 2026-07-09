"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

const initialState: ChangePasswordState = {};

type ChangePasswordFormProps = {
  mode?: "required" | "optional";
  cancelHref?: string;
};

export function ChangePasswordForm({ mode = "required", cancelHref }: ChangePasswordFormProps) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const optional = mode === "optional";

  return (
    <div className={optional ? undefined : portalCardClass}>
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Change password</h1>
      <p className="mt-2 text-sm text-muted">
        {optional
          ? "Update your billing portal password. You will need your current password."
          : "You must choose a new password before continuing."}
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="currentPassword" className={portalLabelClass}>
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={portalInputClass}
          />
        </div>
        <div>
          <label htmlFor="newPassword" className={portalLabelClass}>
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={portalInputClass}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={portalLabelClass}>
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={portalInputClass}
          />
        </div>
        {state.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {optional && cancelHref && (
            <Link href={cancelHref} className={portalButtonSecondaryClass}>
              Cancel
            </Link>
          )}
          <button
            type="submit"
            disabled={pending}
            className={`${portalButtonClass} ${optional ? "" : "w-full"}`}
          >
            {pending ? "Saving…" : optional ? "Save password" : "Save and continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
