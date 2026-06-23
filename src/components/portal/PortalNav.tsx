import Link from "next/link";
import { auth, signOut } from "@/auth";

const adminLinks = [
  { href: "/portal/admin/dashboard", label: "Dashboard" },
  { href: "/portal/admin/pay-periods", label: "Pay periods" },
  { href: "/portal/admin/clients", label: "Clients" },
  { href: "/portal/admin/invoices", label: "Invoices" },
  { href: "/portal/admin/generate-bill", label: "Generate L&I bill" },
  { href: "/portal/admin/bills", label: "Bill history" },
];

const therapistLinks = [
  { href: "/portal/therapist/dashboard", label: "Dashboard" },
  { href: "/portal/therapist/invoices", label: "Invoices" },
  { href: "/portal/therapist/invoices/new", label: "New invoice" },
];

export async function PortalNav() {
  const session = await auth();
  if (!session?.user) return null;

  const links = session.user.role === "ADMIN" ? adminLinks : therapistLinks;

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div>
          <Link href="/" className="font-serif text-lg font-semibold text-primary-dark">
            Grandview Counseling
          </Link>
          <p className="text-xs text-muted">Billing portal · {session.user.firstName}</p>
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
    </header>
  );
}
