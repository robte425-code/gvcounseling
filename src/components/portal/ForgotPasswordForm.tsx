"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestTherapistPasswordResetAction,
  type ForgotPasswordState,
} from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass, portalInputClass, portalLabelClass } from "@/components/portal/ui";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestTherapistPasswordResetAction, initialState);

  if (state.sent) {
    return (
      <div className={portalCardClass}>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          If a therapist account exists for that email address, we sent a link to reset your password.
          The link expires in 1 hour.
        </p>
        <Link href="/portal/login" className={`${portalButtonClass} mt-6 inline-block text-center`}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className={portalCardClass}>
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter your therapist account email and we will send a link to reset your password.
      </p>
      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className={portalLabelClass}>
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={portalInputClass} />
        </div>
        {state.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${portalButtonClass} w-full`}>
          {pending ? "Sending…" : "Send reset link"}
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
