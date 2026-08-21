import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export class RateLimitError extends Error {
  constructor(message = "Too many requests. Please try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Identify the caller for rate limiting, preferring headers the platform sets
 * over ones the caller can choose.
 *
 * Taking the first entry of x-forwarded-for let a caller pick their own bucket
 * by varying the header, so the limit never triggered. x-vercel-forwarded-for
 * and x-real-ip are set by the proxy; on x-forwarded-for the proxy appends, so
 * the last entry is the one it vouches for, not the first.
 */
export function clientIpFromRequest(request: NextRequest): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelForwarded) return vercelForwarded.split(",").pop()!.trim();

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").pop()?.trim();
    if (last) return last;
  }
  return "unknown";
}

function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = new Date();
  const start = windowStart(now, windowMs);

  const bucket = await prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({
      where: { key_windowStart: { key, windowStart: start } },
    });
    if (existing) {
      return tx.rateLimitBucket.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });
    }
    return tx.rateLimitBucket.create({
      data: { key, windowStart: start, count: 1 },
    });
  });

  if (bucket.count > limit) {
    throw new RateLimitError();
  }
}

/** True when the key has already used up its allowance, without spending any of it. */
export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const bucket = await prisma.rateLimitBucket.findUnique({
    where: { key_windowStart: { key, windowStart: windowStart(new Date(), windowMs) } },
    select: { count: true },
  });
  return (bucket?.count ?? 0) >= limit;
}

/**
 * Count one attempt against the key without enforcing.
 *
 * Lets sign-in charge only failures, so someone logging in normally is never
 * throttled and the budget is spent solely by wrong guesses.
 */
export async function recordRateLimitedAttempt(key: string, windowMs: number): Promise<void> {
  const start = windowStart(new Date(), windowMs);
  await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart: start } },
    create: { key, windowStart: start, count: 1 },
    update: { count: { increment: 1 } },
  });
}
