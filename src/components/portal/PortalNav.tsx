import Link from "next/link";
import { auth, getRealRole, isImpersonating, signOut } from "@/auth";
import { stopImpersonationAction } from "@/lib/portal-actions";
import { ViewAsTherapistSelect } from "@/components/portal/ViewAsTherapistSelect";
import { prisma } from "@/lib/prisma";

const adminLinks = [
  { href: "/portal/admin/dashboard", label: "Dashboard" },
  { href: "/portal/admin/pay-periods", label: "Pay periods" },
  { href: "/portal/admin/clients", label: "Clients" },
  { href: "/portal/admin/therapists", label: "Therapists" },
  { href: "/portal/admin/invoices", label: "Invoices" },
  { href: "/portal/admin/generate-bill", label: "Generate L&I bill" },
  { href: "/portal/admin/bills", label: "Bill history" },
];

const therapistLinks = [
  { href: "/portal/therapist/dashboard", label: "Dashboard" },
  { href: "/portal/therapist/clients", label: "Clients" },
  { href: "/portal/therapist/invoices", label: "Invoices" },
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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link href="/" className="font-serif text-lg font-semibold text-primary-dark">
              Grandview Counseling
            </Link>
            <p className="text-xs text-muted">
              Billing portal ·{" "}
              {impersonating ? (
                session.user.firstName
              ) : (
                <Link href="/portal/profile" className="hover:text-primary-dark hover:underline">
                  {session.user.firstName}
                </Link>
              )}
              {admin && !impersonating ? " (admin)" : ""}
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-primary/10 hover:text-primary-dark"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            {!impersonating && (
              <Link
                href="/portal/profile"
                className="text-sm text-muted hover:text-primary-dark"
              >
                {admin ? "Admin" : "Account"}
              </Link>
            )}
            {therapists.length > 0 && <ViewAsTherapistSelect therapists={therapists} />}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/portal/login" });
              }}
            >
              <button type="submit" className="text-sm text-muted hover:text-primary-dark">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
    </>
  );
}
