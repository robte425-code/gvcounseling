import { auth, getRealRole, isImpersonating, signOut } from "@/auth";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { adminNavGroups, therapistNavGroups } from "@/components/portal/portal-nav-config";
import { stopImpersonationAction } from "@/lib/portal-actions";
import { ViewAsTherapistSelect } from "@/components/portal/ViewAsTherapistSelect";
import { portalNavButtonClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export async function PortalNav({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) return null;

  const impersonating = isImpersonating(session);
  const admin = getRealRole(session) === "ADMIN";
  const groups = impersonating || session.user.role === "THERAPIST" ? therapistNavGroups : adminNavGroups;

  const therapists =
    admin && !impersonating
      ? await prisma.user.findMany({
          where: { role: "THERAPIST", active: true },
          orderBy: { firstName: "asc" },
          select: { email: true, firstName: true, lastName: true },
        })
      : [];

  const siteLabel = `Billing portal · ${session.user.firstName}${admin && !impersonating ? " (admin)" : ""}`;

  const footer = (
    <>
      {therapists.length > 0 && <ViewAsTherapistSelect therapists={therapists} />}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/portal/login" });
        }}
      >
        <button type="submit" className={`${portalNavButtonClass} w-full justify-start px-3`}>
          Sign out
        </button>
      </form>
    </>
  );

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
      <PortalSidebar groups={groups} siteLabel={siteLabel} footer={footer}>
        {children}
      </PortalSidebar>
    </>
  );
}
