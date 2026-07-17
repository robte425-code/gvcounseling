#!/usr/bin/env tsx
/**
 * One-shot / pending: regenerate an 837 for a cutoff date (including billed invoices)
 * and archive it to Drive root "837 Files".
 *
 * Triggered from production build when PortalSetting pending_837_archive_cutoff is set.
 * Also runnable manually:
 *   PENDING_837_ARCHIVE_CUTOFF=2026-07-17 PENDING_837_ARCHIVE_USAGE=P npx tsx scripts/run-pending-837-archive.ts
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

const PENDING_837_ARCHIVE_CUTOFF_KEY = "pending_837_archive_cutoff";
const PENDING_837_ARCHIVE_USAGE_KEY = "pending_837_archive_usage";

function parseUsage(value: string | null | undefined): "T" | "P" | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized === "T" || normalized === "P" ? normalized : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("run-pending-837-archive: DATABASE_URL not set — skipping");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  const { calendarIsoFromDate } = await import("../src/lib/constants");
  const { generate837ForPayPeriod } = await import("../src/lib/generate-837-for-pay-period");
  const { getIsaUsageIndicator } = await import("../src/lib/edi837");

  const envCutoff = process.env.PENDING_837_ARCHIVE_CUTOFF?.trim();
  const envUsage = process.env.PENDING_837_ARCHIVE_USAGE?.trim();
  const [cutoffSetting, usageSetting] = await Promise.all([
    prisma.portalSetting.findUnique({
      where: { key: PENDING_837_ARCHIVE_CUTOFF_KEY },
      select: { value: true },
    }),
    prisma.portalSetting.findUnique({
      where: { key: PENDING_837_ARCHIVE_USAGE_KEY },
      select: { value: true },
    }),
  ]);
  const cutoffIso = envCutoff || cutoffSetting?.value?.trim() || "";
  const usageIndicator =
    parseUsage(envUsage) ?? parseUsage(usageSetting?.value) ?? getIsaUsageIndicator();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffIso)) {
    console.log("run-pending-837-archive: no pending cutoff — skipping");
    await prisma.$disconnect();
    return;
  }

  console.log(
    `run-pending-837-archive: regenerating 837 for cutoff ${cutoffIso} usage=${usageIndicator}`,
  );

  const periods = await prisma.payPeriod.findMany({
    orderBy: { cutoffDate: "desc" },
  });
  const payPeriod = periods.find((period) => calendarIsoFromDate(period.cutoffDate) === cutoffIso);
  if (!payPeriod) {
    console.error(`run-pending-837-archive: no pay period with cutoff ${cutoffIso}`);
    await prisma.portalSetting.deleteMany({
      where: { key: { in: [PENDING_837_ARCHIVE_CUTOFF_KEY, PENDING_837_ARCHIVE_USAGE_KEY] } },
    });
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const admin =
    (await prisma.user.findFirst({
      where: { email: "ghim@gvcounseling.com", role: "ADMIN" },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    }));

  try {
    const result = await generate837ForPayPeriod(payPeriod.id, {
      includeBilled: true,
      archiveToDrive: true,
      usageIndicator,
      generatedById: admin?.id,
    });
    console.log(
      `run-pending-837-archive: ok claims=${result.claimCount} file=${result.filename}` +
        (result.driveArchiveFilename ? ` drive=${result.driveArchiveFilename}` : " drive=FAILED"),
    );
    if (result.driveArchiveFilename) {
      await prisma.portalSetting.deleteMany({
        where: { key: { in: [PENDING_837_ARCHIVE_CUTOFF_KEY, PENDING_837_ARCHIVE_USAGE_KEY] } },
      });
    } else {
      console.error(
        "run-pending-837-archive: Drive archive failed; will retry on next deploy (build continues).",
      );
    }
  } catch (error) {
    console.error("run-pending-837-archive: failed (build continues)", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
