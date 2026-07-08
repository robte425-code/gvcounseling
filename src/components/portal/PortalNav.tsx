import Link from "next/link";
import { auth, getRealRole, isImpersonating, signOut } from "@/auth";
import { PortalNavMenu } from "@/components/portal/PortalNavMenu";
import { stopImpersonationAction } from "@/lib/portal-actions";
import { ViewAsTherapistSelect } from "@/components/portal/ViewAsTherapistSelect";
import { portalNavButtonClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

const adminLinks = [
  { href: "/portal/admin/dashboard", label: "Dashboard" },
  { href: "/portal/admin/billing", label: "Billing" },
  { href: "/portal/admin/pay", label: "Pay" },
  { href: "/portal/admin/paychecks", label: "Paychecks" },
  { href: "/portal/admin/clients", label: "Clients" },
  { href: "/portal/admin/therapists", label: "Therapists" },
  { href: "/portal/admin/admins", label: "Admins" },
  { href: "/portal/admin/invoices", label: "Invoices" },
  { href: "/portal/admin/integrations/google-drive", label: "Google Drive" },
];

const therapistLinks = [
  { href: "/portal/therapist/dashboard", label: "Dashboard" },
  { href: "/portal/therapist/clients", label: "Clients" },
  { href: "/portal/therapist/invoices", label: "Invoices" },
  { href: "/portal/therapist/paychecks", label: "Paychecks" },
  { href: "/portal/therapist/fees", label: "Fees" },
];

export async function PortalNav() {
  const session = await auth();
  if (!session?.user) return null;

  const impersonating = isImpersonating(session);
  const admin = getRealRole(session) === "ADMIN";
  const links = impersonating || session.user.role === "THERAPIST" ? therapistLinks : adminLinks;

  const therapists =
    admin && !impersonating
      ? await prisma.user.findMany({
          where: { role: "THERAPIST", active: true },
          orderBy: { firstName: "asc" },
          select: { email: true, firstName: true, lastName: true },
        })
      : [];

  return (
    <>
      {impersonating && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          Viewing as{" "}
          <span className="font-medium">
            {session.user.firstName} {session.user.lastName}
          </span>
          {" · "}
          <form action={stopImpersonationAction} className="inline">
            <button type="submit" className="font-medium underline hover:no-underline">
              Exit to admin
            </button>
          </form>
        </div>
      )}
      <PortalNavMenu
        links={links}
        siteLabel={`Billing portal · ${session.user.firstName}${admin && !impersonating ? " (admin)" : ""}`}
        trailing={
          <>
            {therapists.length > 0 && <ViewAsTherapistSelect therapists={therapists} />}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/portal/login" });
              }}
            >
              <button type="submit" className={`${portalNavButtonClass} min-h-11 lg:min-h-0`}>
                Sign out
              </button>
            </form>
          </>
        }
      />
    </>
  );
}
