import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export class RateLimitError extends Error {
  constructor(message = "Too many requests. Please try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export function clientIpFromRequest(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
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
