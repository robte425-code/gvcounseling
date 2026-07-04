/**
 * Scan Steven's active + Closed Cases Drive folders (read-only).
 * Usage: npx tsx scripts/scan-steven-closed-cases.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";

const STEVEN_CLAIMS = new Set([
  "AW17192", "AY83414", "AZ48910", "BA25824", "BL00889", "BM17605", "BM35909", "BM50321",
  "BH00259", "BK75175", "BL69750", "BM08580", "BM37705", "BM49430", "BN44993", "BN69737",
  "BP24936", "ZB62154",
]);


async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();
  const {
    getTherapistFolderConfig,
    listClientFolders,
    parseClientFolderName,
    resolveTherapistFolderId,
    findDriveSubfolder,
  } = await import("../src/lib/google-drive");
  const { getValidGoogleAccessToken } = await import("../src/lib/google-oauth");
  const { resolveOAuthUserIdForTherapist } = await import("../src/lib/google-drive-access");

  const steven = await prisma.user.findFirst({
    where: { email: "steven@gvcounseling.com" },
    select: { id: true },
  });
  const admin = await prisma.user.findFirst({ where: { email: "ghim@gvcounseling.com" } });
  if (!steven || !admin) throw new Error("Steven or admin not found");

  const cfg = getTherapistFolderConfig().steven;
  const closedSubfolder = cfg.closedSubfolderName;
  const oauthUserId = await resolveOAuthUserIdForTherapist(steven.id, admin.id);
  const accessToken = await getValidGoogleAccessToken(oauthUserId);
  const stevenFolderId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);

  const activeFolders = await listClientFolders(accessToken, stevenFolderId);
  const closedParent = await findDriveSubfolder(accessToken, stevenFolderId, closedSubfolder);
  const closedFolders = closedParent
    ? await listClientFolders(accessToken, closedParent.id)
    : [];

  function mapFolder(f: { id: string; name: string }, location: "active" | "closed") {
    const parsed = parseClientFolderName(f.name);
    return {
      folderId: f.id,
      folderName: f.name,
      location,
      claimNumber: parsed?.claimNumber ?? null,
      inSpreadsheet: parsed ? STEVEN_CLAIMS.has(parsed.claimNumber) : false,
    };
  }

  const active = activeFolders.map((f) => mapFolder(f, "active"));
  const closed = closedFolders.map((f) => mapFolder(f, "closed"));
  const spreadsheetInDrive = [...active, ...closed].filter((f) => f.inSpreadsheet);
  const spreadsheetMissing = [...STEVEN_CLAIMS].filter(
    (claim) => !spreadsheetInDrive.some((f) => f.claimNumber === claim),
  );

  const output = {
    at: new Date().toISOString(),
    stevenFolder: { id: stevenFolderId, name: cfg.folderName },
    closedCasesFolder: closedParent
      ? { id: closedParent.id, name: closedSubfolder }
      : null,
    activeCount: active.length,
    closedCount: closed.length,
    spreadsheetClaimsFound: spreadsheetInDrive,
    spreadsheetClaimsMissing: spreadsheetMissing,
    active,
    closed,
  };

  writeFileSync("scripts/steven-closed-cases-scan.json", JSON.stringify(output, null, 2));
  console.log(`Spreadsheet claims in Drive: ${spreadsheetInDrive.length}/18`);
  console.log(`Missing: ${spreadsheetMissing.join(", ") || "(none)"}`);
  console.log(`Active folders: ${active.length}, Closed: ${closed.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
