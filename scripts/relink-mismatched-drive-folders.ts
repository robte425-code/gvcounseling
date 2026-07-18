#!/usr/bin/env tsx
/**
 * Relink clients whose stored Drive folder name does not match their L&I claim.
 *
 * Default (production build): only BM47751 (known mis-link).
 * Manual:
 *   npx tsx scripts/relink-mismatched-drive-folders.ts
 *   npx tsx scripts/relink-mismatched-drive-folders.ts BM47751
 *   npx tsx scripts/relink-mismatched-drive-folders.ts --all
 */
import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import path from "path";

function loadSmokeEnv() {
  const file = path.join(process.cwd(), ".env.smoke.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadSmokeEnv();

const DEFAULT_CLAIMS = ["BM47751"];

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("relink-mismatched-drive-folders: DATABASE_URL not set — skipping");
    return;
  }

  const args = process.argv.slice(2).map((a) => a.trim()).filter(Boolean);
  const all = args.includes("--all");
  const claimArgs = args
    .filter((a) => a !== "--all")
    .map((a) => a.toUpperCase());

  const { prisma } = await import("../src/lib/prisma");
  const { ensureClientDriveFolderMatchesClaim } = await import(
    "../src/lib/drive-client-import"
  );

  const adminEmail =
    process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL?.trim() || "ghim@gvcounseling.com";
  const admin = await prisma.user.findFirst({
    where: { email: adminEmail, googleDriveConnection: { isNot: null } },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.log(
      `relink-mismatched-drive-folders: no Drive-connected admin (${adminEmail}) — skipping`,
    );
    await prisma.$disconnect();
    return;
  }

  const clients = await prisma.client.findMany({
    where: all
      ? { driveFolderId: { not: null } }
      : { lniClaimNumber: { in: claimArgs.length ? claimArgs : DEFAULT_CLAIMS } },
    select: {
      id: true,
      lniClaimNumber: true,
      driveFolderId: true,
      therapistId: true,
      firstName: true,
      lastName: true,
    },
    orderBy: { lniClaimNumber: "asc" },
  });

  console.log(
    `relink-mismatched-drive-folders: checking ${clients.length} client(s) as ${admin.email}`,
  );

  let relinked = 0;
  let ok = 0;
  let warnings = 0;

  for (const client of clients) {
    try {
      const result = await ensureClientDriveFolderMatchesClaim({
        initiatorUserId: admin.id,
        clientId: client.id,
        claimNumber: client.lniClaimNumber,
        driveFolderId: client.driveFolderId,
        therapistId: client.therapistId,
      });
      if (result.relinked) {
        relinked++;
        console.log(
          `  RELINKED ${client.lniClaimNumber} (${client.lastName}, ${client.firstName}) → ${result.driveFolderId}${
            result.warning ? ` (${result.warning})` : ""
          }`,
        );
      } else if (result.warning) {
        warnings++;
        console.log(`  WARN ${client.lniClaimNumber}: ${result.warning}`);
      } else {
        ok++;
        console.log(`  OK ${client.lniClaimNumber}`);
      }
    } catch (e) {
      warnings++;
      console.log(
        `  ERROR ${client.lniClaimNumber}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(
    `relink-mismatched-drive-folders: done ok=${ok} relinked=${relinked} warnings=${warnings}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("relink-mismatched-drive-folders failed:", e);
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
