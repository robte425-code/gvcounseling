"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  isPortalNavLinkActive,
  type PortalNavGroup,
} from "@/components/portal/portal-nav-config";

type PortalSidebarProps = {
  groups: PortalNavGroup[];
  siteLabel: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

const sidebarLinkClass =
  "flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-primary/10 hover:text-primary-dark";

function SidebarNav({
  groups,
  onNavigate,
}: {
  groups: PortalNavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Portal">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.links.map((link) => {
              const active = isPortalNavLinkActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    className={`${sidebarLinkClass} ${active ? "bg-primary/10 text-primary-dark" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarBrand({ siteLabel }: { siteLabel: string }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <Link href="/" className="font-serif text-lg font-semibold text-primary-dark">
        Grandview Counseling
      </Link>
      <p className="mt-1 truncate text-xs text-muted">{siteLabel}</p>
    </div>
  );
}

export function PortalSidebar({ groups, siteLabel, footer, children }: PortalSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:fixed lg:inset-y-0 lg:z-30 lg:flex">
        <SidebarBrand siteLabel={siteLabel} />
        <SidebarNav groups={groups} />
        {footer ? <div className="mt-auto space-y-3 border-t border-border px-4 py-4">{footer}</div> : null}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100%,18rem)] flex-col border-r border-border bg-surface shadow-xl transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
      >
        <SidebarBrand siteLabel={siteLabel} />
        <SidebarNav groups={groups} onNavigate={() => setMobileOpen(false)} />
        {footer ? <div className="mt-auto space-y-3 border-t border-border px-4 py-4">{footer}</div> : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-primary-dark"
            aria-expanded={mobileOpen}
            aria-controls="portal-mobile-sidebar"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate font-serif text-base font-semibold text-primary-dark">Grandview Counseling</p>
            <p className="truncate text-xs text-muted">{siteLabel}</p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
