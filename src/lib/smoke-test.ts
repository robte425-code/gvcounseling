import type { NextRequest } from "next/server";

/** When set in Vercel, allows smoke tests to exercise rate limits without sending email or writing data. */
export function isSmokeTestRequest(request: NextRequest | Request): boolean {
  const secret = process.env.SMOKE_TEST_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-smoke-test-secret") === secret;
}
