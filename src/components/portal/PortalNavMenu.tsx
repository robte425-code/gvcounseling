"use client";

import Link from "next/link";
import { useState } from "react";
import { portalNavLinkClass } from "@/components/portal/ui";

export type PortalNavLink = { href: string; label: string };

type Props = {
  links: PortalNavLink[];
  siteLabel: string;
  trailing?: React.ReactNode;
};

const mobileNavLinkClass =
  "flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-primary/10 hover:text-primary-dark";

export function PortalNavMenu({ links, siteLabel, trailing }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
        <div className="min-w-0">
          <Link href="/" className="font-serif text-lg font-semibold text-primary-dark">
            Grandview Counseling
          </Link>
          <p className="truncate text-xs text-muted">{siteLabel}</p>
        </div>

        <nav className="hidden flex-wrap items-center gap-1 lg:flex" aria-label="Portal">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={portalNavLinkClass}>
              {link.label}
            </Link>
          ))}
          {trailing}
        </nav>

        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-2 text-primary-dark lg:hidden"
          aria-expanded={open}
          aria-controls="portal-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="portal-mobile-nav"
          className="border-t border-border px-4 py-3 lg:hidden"
          aria-label="Portal mobile"
        >
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={mobileNavLinkClass} onClick={() => setOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {trailing ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">{trailing}</div>
          ) : null}
        </nav>
      )}
    </header>
  );
}
