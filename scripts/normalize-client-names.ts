/**
 * Normalize ALL-CAPS client names to title case.
 * Usage: npx tsx scripts/normalize-client-names.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";

const OUTPUT_PATH = "scripts/normalize-client-names-results.json";

function hasLetter(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function isAllCaps(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !hasLetter(trimmed)) return false;
  return trimmed === trimmed.toUpperCase();
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`);
}

type NameFix = {
  id: string;
  claim: string;
  field: "firstName" | "lastName" | "middleInitial";
  before: string;
  after: string;
};

async function main() {
  const fix = process.argv.includes("--fix");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      lniClaimNumber: true,
      firstName: true,
      lastName: true,
      middleInitial: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const fixes: NameFix[] = [];
  const updates: {
    id: string;
    claim: string;
    firstName?: string;
    lastName?: string;
    middleInitial?: string | null;
  }[] = [];

  for (const client of clients) {
    const patch: {
      firstName?: string;
      lastName?: string;
      middleInitial?: string | null;
    } = {};

    if (isAllCaps(client.firstName)) {
      const after = toTitleCase(client.firstName);
      patch.firstName = after;
      fixes.push({
        id: client.id,
        claim: client.lniClaimNumber,
        field: "firstName",
        before: client.firstName,
        after,
      });
    }

    if (isAllCaps(client.lastName)) {
      const after = toTitleCase(client.lastName);
      patch.lastName = after;
      fixes.push({
        id: client.id,
        claim: client.lniClaimNumber,
        field: "lastName",
        before: client.lastName,
        after,
      });
    }

    if (client.middleInitial && isAllCaps(client.middleInitial)) {
      const after = toTitleCase(client.middleInitial);
      patch.middleInitial = after;
      fixes.push({
        id: client.id,
        claim: client.lniClaimNumber,
        field: "middleInitial",
        before: client.middleInitial,
        after,
      });
    }

    if (Object.keys(patch).length > 0) {
      updates.push({ id: client.id, claim: client.lniClaimNumber, ...patch });
    }
  }

  const report = {
    at: new Date().toISOString(),
    fix,
    totalClients: clients.length,
    clientsToUpdate: updates.length,
    fieldsToFix: fixes.length,
    fixes,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log(`Scanned ${clients.length} clients`);
  console.log(`  Clients to update: ${updates.length}`);
  console.log(`  Name fields to fix: ${fixes.length}`);
  if (fixes.length > 0) {
    console.log("Sample fixes:");
    for (const sample of fixes.slice(0, 15)) {
      console.log(`  ${sample.claim} ${sample.field}: "${sample.before}" -> "${sample.after}"`);
    }
    if (fixes.length > 15) console.log(`  ... and ${fixes.length - 15} more`);
  }

  if (!fix) {
    console.log(`Dry run. Re-run with --fix to apply. Results: ${OUTPUT_PATH}`);
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const row of updates) {
    const { id, claim: _claim, ...data } = row;
    await prisma.client.update({ where: { id }, data });
    updated++;
  }

  console.log(`Updated ${updated} client(s). Results: ${OUTPUT_PATH}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
