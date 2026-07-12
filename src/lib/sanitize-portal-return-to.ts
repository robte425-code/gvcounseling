/** Allowed path prefixes for portal returnTo redirects (pathname only, no query). */
export const PORTAL_ADMIN_CLIENT_RETURN_PREFIXES = ["/portal/admin/clients"] as const;

export const PORTAL_CLIENT_RETURN_PREFIXES = [
  "/portal/admin/clients",
  "/portal/therapist/clients",
  "/portal/therapist/dashboard",
  "/portal/therapist/referrals",
] as const;

export const PORTAL_ADMIN_INVOICE_RETURN_PREFIXES = ["/portal/admin/invoices"] as const;

export const PORTAL_INVOICE_RETURN_PREFIXES = [
  "/portal/admin/invoices",
  "/portal/therapist/invoices",
] as const;

export const PORTAL_THERAPIST_INVOICE_RETURN_PREFIXES = ["/portal/therapist/invoices"] as const;

type SanitizeOptions = {
  fallback: string;
  allowedPrefixes?: readonly string[];
};

function pathnameOf(returnTo: string): string {
  return returnTo.split("?")[0]?.split("#")[0] ?? returnTo;
}

function matchesAllowedPrefix(pathname: string, allowedPrefixes: readonly string[]): boolean {
  return allowedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Restrict returnTo to same-origin portal paths. Rejects open redirects and traversal.
 */
export function sanitizePortalReturnTo(
  value: string | undefined | null,
  options: SanitizeOptions,
): string {
  const fallback = options.fallback;
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  if (
    trimmed.includes("://") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    /[\0\r\n]/.test(trimmed)
  ) {
    return fallback;
  }

  if (!trimmed.startsWith("/portal/")) {
    return fallback;
  }

  const pathname = pathnameOf(trimmed);
  if (options.allowedPrefixes?.length && !matchesAllowedPrefix(pathname, options.allowedPrefixes)) {
    return fallback;
  }

  return trimmed;
}
