"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordWithTokenAction, type ResetPasswordState } from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass, portalInputClass, portalLabelClass } from "@/components/portal/ui";

const initialState: ResetPasswordState = {};

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(resetPasswordWithTokenAction, initialState);

  if (state.success) {
    return (
      <div className={portalCardClass}>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark">Password updated</h1>
        <p className="mt-2 text-sm text-muted">Your password has been reset. You can sign in with your new password.</p>
        <Link href="/portal/login" className={`${portalButtonClass} mt-6 inline-block text-center`}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className={portalCardClass}>
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">Enter a new password for your billing portal account.</p>
      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
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
        <button type="submit" disabled={pending} className={`${portalButtonClass} w-full`}>
          {pending ? "Saving…" : "Reset password"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/portal/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
