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

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signPasswordGateClear(userId: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${userId}|${exp}`),
  );
  return bytesToHex(signature);
}

export async function createPasswordGateClearMarker(
  userId: string,
): Promise<PasswordGateClearMarker> {
  const exp = Date.now() + MARKER_TTL_MS;
  return { exp, sig: await signPasswordGateClear(userId, exp) };
}

export async function verifyPasswordGateClearMarker(
  userId: string,
  marker: PasswordGateClearMarker | undefined,
): Promise<boolean> {
  if (!marker?.sig || typeof marker.exp !== "number") return false;
  if (marker.exp < Date.now()) return false;

  const expected = await signPasswordGateClear(userId, marker.exp);
  return timingSafeEqualHex(marker.sig, expected);
}
