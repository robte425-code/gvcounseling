import { createHmac, timingSafeEqual } from "node:crypto";

const MARKER_TTL_MS = 60_000;

export type PasswordGateClearMarker = {
  exp: number;
  sig: string;
};

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }
  return secret;
}

function signPasswordGateClear(userId: string, exp: number): string {
  return createHmac("sha256", authSecret()).update(`${userId}|${exp}`).digest("hex");
}

export function createPasswordGateClearMarker(userId: string): PasswordGateClearMarker {
  const exp = Date.now() + MARKER_TTL_MS;
  return { exp, sig: signPasswordGateClear(userId, exp) };
}

export function verifyPasswordGateClearMarker(
  userId: string,
  marker: PasswordGateClearMarker | undefined,
): boolean {
  if (!marker?.sig || typeof marker.exp !== "number") return false;
  if (marker.exp < Date.now()) return false;

  const expected = signPasswordGateClear(userId, marker.exp);
  try {
    const a = Buffer.from(marker.sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
