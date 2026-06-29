const PRODUCTION_SITE_URL = "https://www.gvcounseling.com";

const EXACT_PLACEHOLDER = /^(NEXT_PUBLIC_SITE_URL|SITE_URL|VERCEL_URL)$/i;

function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isUsableSiteUrl(raw: string | undefined): raw is string {
  if (!raw?.trim()) return false;
  const trimmed = raw.trim();
  if (EXACT_PLACEHOLDER.test(trimmed)) return false;
  if (/NEXT_PUBLIC|SITE_URL/.test(trimmed) && !trimmed.includes(".")) return false;

  try {
    const url = new URL(normalizeSiteUrl(trimmed));
    if (!url.hostname) return false;
    if (url.hostname === "localhost") return true;
    if (!url.hostname.includes(".")) return false;
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Canonical site URL for links in emails (no trailing slash). */
export function getSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  for (const candidate of candidates) {
    if (isUsableSiteUrl(candidate)) {
      return normalizeSiteUrl(candidate);
    }
  }

  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }

  return "http://localhost:3000";
}
