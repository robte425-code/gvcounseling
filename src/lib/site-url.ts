const PLACEHOLDER_PATTERN = /^(NEXT_PUBLIC_SITE_URL|SITE_URL|VERCEL_URL)$/i;

function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isUsableSiteUrl(raw: string | undefined): raw is string {
  if (!raw?.trim()) return false;
  if (PLACEHOLDER_PATTERN.test(raw.trim())) return false;

  try {
    const url = new URL(normalizeSiteUrl(raw));
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Canonical site URL for links in emails (no trailing slash). */
export function getSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  for (const candidate of candidates) {
    if (isUsableSiteUrl(candidate)) {
      return normalizeSiteUrl(candidate);
    }
  }

  return "http://localhost:3000";
}
