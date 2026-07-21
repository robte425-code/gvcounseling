"use client";

const LINKS = [
  { href: "#billing-validate-999", label: "Validate 999" },
  { href: "#billing-generate", label: "Generate 837" },
  { href: "#billing-setup", label: "Setup" },
  { href: "#billing-fees", label: "L&I fees" },
  { href: "#billing-history", label: "837 history" },
] as const;

export function BillingJumpNav() {
  return (
    <nav
      aria-label="Bill L&I sections"
      className="sticky top-0 z-20 -mx-1 border-b border-border/80 bg-surface/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <ul className="flex flex-wrap gap-1.5">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-flex rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-primary/5 hover:text-primary-dark"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
