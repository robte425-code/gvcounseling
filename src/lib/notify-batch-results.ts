import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Holds the outcome of a VRC email or L&I fax batch so the page can show it
 * without carrying it through the URL.
 *
 * These lines read "BL41649 (Doe, Jane) → jane@vrc-firm.com" — patient name,
 * L&I claim number, and the VRC's address. In a query string that lands in
 * server access logs, browser history, and any Referer the page emits. The URL
 * now carries only an opaque id.
 */
export type NotifyBatchResult = {
  kind: "vrc" | "fax";
  sent: number;
  recipients: string[];
  more: number;
  adminCc: string[];
  skipped: string[];
  errors: string[];
};

const KEY_PREFIX = "notify_batch_result:";
const TTL_MS = 30 * 60 * 1000;

type StoredResult = NotifyBatchResult & { storedAt: string };

export async function storeNotifyBatchResult(result: NotifyBatchResult): Promise<string> {
  const id = randomBytes(16).toString("base64url");
  const payload: StoredResult = { ...result, storedAt: new Date().toISOString() };
  await prisma.portalSetting.create({
    data: { key: `${KEY_PREFIX}${id}`, value: JSON.stringify(payload) },
  });
  return id;
}

/** Reads the result once and deletes it; expired entries are swept on the way past. */
export async function consumeNotifyBatchResult(
  id: string | undefined,
): Promise<NotifyBatchResult | null> {
  if (!id?.trim()) return null;

  const key = `${KEY_PREFIX}${id.trim()}`;
  const row = await prisma.portalSetting.findUnique({ where: { key } });
  await sweepExpired();
  if (!row) return null;

  await prisma.portalSetting.delete({ where: { key } }).catch(() => undefined);

  try {
    const parsed = JSON.parse(row.value) as StoredResult;
    if (Date.now() - new Date(parsed.storedAt).getTime() > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function sweepExpired(): Promise<void> {
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();
  const stale = await prisma.portalSetting.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
    select: { key: true, value: true },
  });
  const expiredKeys = stale
    .filter((row) => {
      try {
        return (JSON.parse(row.value) as StoredResult).storedAt < cutoff;
      } catch {
        return true;
      }
    })
    .map((row) => row.key);
  if (expiredKeys.length) {
    await prisma.portalSetting.deleteMany({ where: { key: { in: expiredKeys } } });
  }
}
