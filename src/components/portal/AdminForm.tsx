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
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={portalLabelCompactClass}>Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="admin@example.com"
            className={portalInputCompactClass}
          />
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
  );
}
