import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalFormGridClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import { updateAdminAction } from "@/lib/portal-actions";
import Link from "next/link";

type AdminManageFormProps = {
  admin: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

export function AdminManageForm({ admin }: AdminManageFormProps) {
  return (
    <form action={updateAdminAction} className={`${portalCardCompactClass} space-y-4`}>
      <input type="hidden" name="id" value={admin.id} />
      <div className={portalFormGridClass}>
        <div>
          <label className={portalLabelCompactClass}>First name</label>
          <input
            name="firstName"
            required
            defaultValue={admin.firstName}
            className={portalInputCompactClass}
          />
        </div>
        <div>
          <label className={portalLabelCompactClass}>Last name</label>
          <input
            name="lastName"
            required
            defaultValue={admin.lastName}
            className={portalInputCompactClass}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={portalButtonClass}>
          Save changes
        </button>
        <Link href="/portal/admin/admins" className={portalButtonSecondaryClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
