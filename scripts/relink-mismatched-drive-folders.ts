#!/usr/bin/env tsx
/**
 * Audit every client's driveFolderId against live folders under therapist
 * client trees (Maria: Client files / Steven: Client files). Relinks trash,
 * wrong-claim, and missing links.
 *
 * Production build runs with --all --fix (default when no args).
 *
 * Manual:
 *   npx tsx scripts/relink-mismatched-drive-folders.ts
 *   npx tsx scripts/relink-mismatched-drive-folders.ts --all
 *   npx tsx scripts/relink-mismatched-drive-folders.ts BM47751
 *   npx tsx scripts/relink-mismatched-drive-folders.ts --all --dry-run
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
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

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("relink-mismatched-drive-folders: DATABASE_URL not set — skipping");
    return;
  }

  const args = process.argv.slice(2).map((a) => a.trim()).filter(Boolean);
  const dryRun = args.includes("--dry-run");
  const all = args.includes("--all") || args.every((a) => a.startsWith("--"));
  const claimArgs = args
    .filter((a) => !a.startsWith("--"))
    .map((a) => a.toUpperCase());

  const { prisma } = await import("../src/lib/prisma");
  const {
    auditAndRelinkClientDriveFolders,
    formatDriveFolderAuditReport,
  } = await import("../src/lib/drive-folder-audit");
  const { sendEmailTo } = await import("../src/lib/email");

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

  console.log(
    `relink-mismatched-drive-folders: auditing ${
      claimArgs.length ? claimArgs.join(",") : "ALL clients"
    } as ${admin.email}${dryRun ? " (dry-run)" : ""}`,
  );

  const report = await auditAndRelinkClientDriveFolders({
    initiatorUserId: admin.id,
    fix: !dryRun,
    claimNumbers: claimArgs.length && !all ? claimArgs : undefined,
  });

  const text = formatDriveFolderAuditReport(report);
  console.log(text);

  try {
    const outDir = path.join(process.cwd(), "artifacts");
    mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "drive-folder-audit-latest.txt");
    writeFileSync(outFile, text, "utf8");
    console.log(`Wrote ${outFile}`);
  } catch (e) {
    console.log(
      `Could not write local audit artifact: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Email when anything was relinked or still problematic (skip pure all-ok noise).
  if (report.relinked > 0 || report.issues > 0) {
    try {
      await sendEmailTo(adminEmail, {
        subject: `[GV Counseling] Drive folder audit: ${report.relinked} relinked, ${report.issues} issues`,
        text,
      });
      console.log(`Emailed audit summary to ${adminEmail}`);
    } catch (e) {
      console.log(
        `Could not email audit summary: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

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
