import { changePasswordAction } from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass, portalInputClass, portalLabelClass } from "@/components/portal/ui";

export default function ChangePasswordPage() {
  return (
    <div className={portalCardClass}>
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Change password</h1>
      <p className="mt-2 text-sm text-muted">Choose a new password before continuing.</p>
      <form action={changePasswordAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="currentPassword" className={portalLabelClass}>
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
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
            className={portalInputClass}
          />
        </div>
        <button type="submit" className={`${portalButtonClass} w-full`}>
          Save and continue
        </button>
      </form>
    </div>
  );
}
