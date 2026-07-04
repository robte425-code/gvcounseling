/**
 * Import all Steven client folders (active + CLOSED), allowing incomplete records.
 * Usage: npx tsx scripts/import-steven-clients.ts [--claims=BH00259,AW17192]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";

const TRANSFERRED_TO_MARIA = new Set(["BM08580"]);

async function main() {
  const {
    formatMissingRequiredFields,
    getMissingRequiredImportFields,
  } = await import("../src/lib/client-import-quality");
  const { importDriveClientFolder, scanTherapistDriveClientFolders } = await import(
    "../src/lib/drive-client-import",
  );
  const { parseClientFolderName } = await import("../src/lib/google-drive");
  const { resolveOAuthUserIdForTherapist } = await import("../src/lib/google-drive-access");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const RESULTS_PATH = "scripts/import-steven-clients-results.json";

  function parseClaimFilter(argv: string[]): Set<string> | null {
    const arg = argv.find((a) => a.startsWith("--claims="));
    if (!arg) return null;
    return new Set(
      arg
        .slice("--claims=".length)
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  const claimFilter = parseClaimFilter(process.argv.slice(2));
  const admin = await prisma.user.findFirst({ where: { email: "ghim@gvcounseling.com" } });
  const steven = await prisma.user.findFirst({ where: { email: "steven@gvcounseling.com" } });
  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  if (!admin || !steven || !maria) throw new Error("Admin, Steven, or Maria user not found");

  const reassigned = await prisma.client.updateMany({
    where: { lniClaimNumber: "BM08580", therapistId: steven.id },
    data: { therapistId: maria.id, assignmentStatus: "ACTIVE", closedAt: null },
  });
  if (reassigned.count) {
    console.log("Reassigned BM08580 (Heather Williams) from Steven to Maria.");
  }

  const { folders, errors: scanErrors } = await scanTherapistDriveClientFolders(
    steven.id,
    admin.id,
    { includeClosedCases: true },
  );

  let targets = folders.filter((f) => {
    const parsed = parseClientFolderName(f.folderName);
    return !parsed || !TRANSFERRED_TO_MARIA.has(parsed.claimNumber);
  });

  if (claimFilter) {
    targets = targets.filter((f) => {
      const parsed = parseClientFolderName(f.folderName);
      return parsed && claimFilter.has(parsed.claimNumber);
    });
  }

  const oauthUserId = await resolveOAuthUserIdForTherapist(steven.id, admin.id);
  const results: {
    claim: string;
    folder: string;
    fromClosedCases: boolean;
    created: boolean;
    updated: boolean;
    skipped: boolean;
    errors: string[];
    warnings: string[];
    missingFields: string[];
  }[] = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const closedCount = targets.filter((f) => f.fromClosedCases).length;
  console.log(`Importing ${targets.length} Steven folders (${closedCount} from CLOSED)…`);

  for (let i = 0; i < targets.length; i++) {
    const folder = targets[i]!;
    const parsed = parseClientFolderName(folder.folderName);
    const claim = parsed?.claimNumber ?? folder.folderName;
    process.stdout.write(`[${i + 1}/${targets.length}] ${claim} ... `);

    const before = parsed
      ? await prisma.client.findUnique({ where: { lniClaimNumber: parsed.claimNumber } })
      : null;

    const importResult = await importDriveClientFolder(oauthUserId, folder);
    const client = parsed
      ? await prisma.client.findUnique({ where: { lniClaimNumber: parsed.claimNumber } })
      : null;

    const missingFields = client
      ? formatMissingRequiredFields(
          getMissingRequiredImportFields(
            {
              diagnoses: client.diagnoses,
              warnings: [],
              claimNumber: client.lniClaimNumber,
              dateOfInjury: client.dateOfInjury ?? undefined,
              vrcName: client.vrcName ?? undefined,
            },
            {
              diagnoses: client.diagnoses,
              warnings: [],
              claimNumber: client.lniClaimNumber,
              employerName: client.employerName ?? undefined,
              attendingDoctorName: client.attendingDoctorName ?? undefined,
              claimManagerName: client.claimManagerName ?? undefined,
              addressLine1: client.addressLine1 ?? undefined,
              city: client.city ?? undefined,
              state: client.state ?? undefined,
              zip: client.zip ?? undefined,
              residenceAddressLine1: client.residenceAddressLine1 ?? undefined,
              residenceCity: client.residenceCity ?? undefined,
              residenceState: client.residenceState ?? undefined,
              residenceZip: client.residenceZip ?? undefined,
              dateOfInjury: client.dateOfInjury ?? undefined,
              vrcName: client.vrcName ?? undefined,
            },
          ),
        )
      : "";

    const row = {
      claim,
      folder: folder.folderName,
      fromClosedCases: !!folder.fromClosedCases,
      created: !!client && !before,
      updated: !!client && !!before,
      skipped: importResult.skipped > 0,
      errors: importResult.errors,
      warnings: importResult.warnings,
      missingFields: missingFields ? missingFields.split(", ") : [],
    };
    results.push(row);

    if (importResult.errors.length || !client) {
      failed++;
      console.log("FAIL", importResult.errors.join("; ") || "not created");
    } else if (row.created) {
      created++;
      console.log("CREATED", row.missingFields.length ? `(missing: ${missingFields})` : "");
    } else if (row.updated) {
      updated++;
      console.log("UPDATED", row.missingFields.length ? `(missing: ${missingFields})` : "");
    } else {
      skipped++;
      console.log("UNCHANGED");
    }
  }

  const summary = {
    at: new Date().toISOString(),
    total: targets.length,
    created,
    updated,
    skipped,
    failed,
    scanErrors,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} unchanged, ${failed} failed`);
  console.log("Results:", RESULTS_PATH);

  const incomplete = results.filter((r) => r.missingFields.length > 0 && !r.errors.length);
  if (incomplete.length) {
    console.log(`\n${incomplete.length} clients with missing fields (edit manually):`);
    for (const r of incomplete) {
      console.log(`  ${r.claim}: ${r.missingFields.join(", ")}`);
    }
  }

  if (failed > 0) process.exit(1);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
