/**
 * Import all Maria client folders (active + Closed Cases), allowing incomplete records.
 * Usage: npx tsx scripts/import-maria-clients.ts [--claims=BJ62798,BH15269]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";

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

  const RESULTS_PATH = "scripts/import-maria-clients-results.json";

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
  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  if (!admin || !maria) throw new Error("Admin or Maria user not found");

  const { folders, errors: scanErrors } = await scanTherapistDriveClientFolders(maria.id, admin.id, {
    includeClosedCases: true,
  });

  let targets = folders;
  if (claimFilter) {
    targets = folders.filter((f) => {
      const parsed = parseClientFolderName(f.folderName);
      return parsed && claimFilter.has(parsed.claimNumber);
    });
  }

  const oauthUserId = await resolveOAuthUserIdForTherapist(maria.id, admin.id);
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

  console.log(
    `Importing ${targets.length} Maria folders (${folders.filter((f) => f.fromClosedCases).length} from Closed Cases)…`,
  );

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
    console.log(`\n${incomplete.length} clients created/updated with missing fields (edit manually):`);
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
