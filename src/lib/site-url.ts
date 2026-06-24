/** Canonical site URL for links in emails (no trailing slash). */
export function getSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}
