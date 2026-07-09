export type PortalNavLink = { href: string; label: string };

export type PortalNavGroup = {
  label: string;
  links: PortalNavLink[];
};

export const adminNavGroups: PortalNavGroup[] = [
  {
    label: "Overview",
    links: [{ href: "/portal/admin/dashboard", label: "Dashboard" }],
  },
  {
    label: "Billing",
    links: [
      { href: "/portal/admin/billing", label: "Bill L&I" },
      { href: "/portal/admin/pay", label: "Process RA" },
      { href: "/portal/admin/paychecks", label: "Paychecks" },
      { href: "/portal/admin/invoices", label: "Invoices" },
    ],
  },
  {
    label: "Clients & team",
    links: [
      { href: "/portal/admin/clients", label: "Clients" },
      { href: "/portal/admin/therapists", label: "Therapists" },
    ],
  },
  {
    label: "Administrative",
    links: [
      { href: "/portal/admin/admins", label: "Admin" },
      { href: "/portal/admin/integrations/google-drive", label: "Google Drive" },
    ],
  },
];

export const therapistNavGroups: PortalNavGroup[] = [
  {
    label: "Overview",
    links: [{ href: "/portal/therapist/dashboard", label: "Dashboard" }],
  },
  {
    label: "Clients",
    links: [
      { href: "/portal/therapist/clients", label: "My clients" },
      { href: "/portal/therapist/invoices", label: "Invoices" },
    ],
  },
  {
    label: "Payments",
    links: [
      { href: "/portal/therapist/paychecks", label: "Paychecks" },
      { href: "/portal/therapist/fees", label: "My rates" },
    ],
  },
  {
    label: "Account",
    links: [{ href: "/portal/therapist/account", label: "Settings" }],
  },
];

export function flattenNavGroups(groups: PortalNavGroup[]): PortalNavLink[] {
  return groups.flatMap((group) => group.links);
}

export function isPortalNavLinkActive(pathname: string, href: string): boolean {
  if (href.endsWith("/dashboard")) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
