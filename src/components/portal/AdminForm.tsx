"use client";

import { useActionState } from "react";
import { createAdminAction, type AdminFormState } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalCardCompactClass,
  portalFormGridClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

const initialState: AdminFormState = {};

export function AdminForm() {
  const [state, formAction, pending] = useActionState(createAdminAction, initialState);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-primary-dark">Add admin</h3>
      <form action={formAction} className={`${portalCardCompactClass} space-y-4`}>
        <div className={portalFormGridClass}>
          <div>
            <label className={portalLabelCompactClass}>First name</label>
            <input name="firstName" required className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Last name</label>
            <input name="lastName" required className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="admin@example.com"
              className={portalInputCompactClass}
            />
          </div>
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
              Leave blank to auto-generate a temporary password (must be changed on first login). If
              you set a password here, they can sign in with it directly.
            </p>
          </div>
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className={portalButtonClass}>
          {pending ? "Adding…" : "Add admin"}
        </button>
      </form>
    </div>
  );
}
