/**
 * Scan Maria's Closed Cases subfolder (read-only). Does not import.
 * Usage: npx tsx scripts/scan-closed-cases.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import {
  getTherapistFolderConfig,
  listClientFolders,
  parseClientFolderName,
  resolveTherapistFolderId,
} from "../src/lib/google-drive";
import { getValidGoogleAccessToken } from "../src/lib/google-oauth";
import { resolveOAuthUserIdForTherapist } from "../src/lib/google-drive-access";
import { parseClaimNumber, isLniClaimNumber } from "../src/lib/constants";

const CLOSED_SUBFOLDER = "Closed Cases";

function parseClosedFolderName(name: string): {
  claimNumber: string;
  displayName: string;
  parseable: boolean;
  parseMethod: "standard" | "strip-closed" | "none";
} | null {
  const standard = parseClientFolderName(name);
  if (standard) {
    return { ...standard, parseable: true, parseMethod: "standard" };
  }

  const closedPrefix = /^CLOSED\s+/i;
  if (closedPrefix.test(name)) {
    const stripped = name.replace(closedPrefix, "");
    const dash = stripped.indexOf(" - ");
    if (dash !== -1) {
      const claimNumber = parseClaimNumber(stripped.slice(0, dash).trim());
      const displayName = stripped.slice(dash + 3).trim();
      if (isLniClaimNumber(claimNumber) && displayName) {
        return { claimNumber, displayName, parseable: true, parseMethod: "strip-closed" };
      }
    }
  }

  const dash = name.indexOf(" - ");
  if (dash === -1) return null;
  return {
    claimNumber: name.slice(0, dash).trim(),
    displayName: name.slice(dash + 3).trim(),
    parseable: false,
    parseMethod: "none",
  };
}

async function findSubfolder(accessToken: string, parentId: string, name: string) {
  const query = [
    `'${parentId}' in parents`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `name='${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name)",
    pageSize: "10",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  return data.files ?? [];
}

async function main() {
  const maria = await prisma.user.findFirst({
    where: { email: "maria@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!maria) throw new Error("Maria not found");

  const admin = await prisma.user.findFirst({ where: { email: "ghim@gvcounseling.com" } });
  if (!admin) throw new Error("Admin not found");

  const cfg = getTherapistFolderConfig().maria;
  const oauthUserId = await resolveOAuthUserIdForTherapist(maria.id, admin.id);
  const accessToken = await getValidGoogleAccessToken(oauthUserId);

  const mariaFolderId = await resolveTherapistFolderId(
    accessToken,
    cfg.folderId,
    cfg.folderName,
  );

  const closedMatches = await findSubfolder(accessToken, mariaFolderId, CLOSED_SUBFOLDER);
  if (!closedMatches.length) {
    console.error(`No "${CLOSED_SUBFOLDER}" subfolder under ${cfg.folderName}`);
    process.exit(1);
  }

  const closedFolderId = closedMatches[0]!.id;
  const activeFolders = await listClientFolders(accessToken, mariaFolderId);
  const closedFolders = await listClientFolders(accessToken, closedFolderId);

  const activeParsed = activeFolders
    .map((f) => ({ ...f, parsed: parseClientFolderName(f.name) }))
    .filter((f) => f.parsed);

  const closedParsed = closedFolders.map((f) => ({
    id: f.id,
    name: f.name,
    parsed: parseClosedFolderName(f.name),
  }));

  const output = {
    at: new Date().toISOString(),
    mariaFolder: { id: mariaFolderId, name: cfg.folderName },
    closedCasesFolder: { id: closedFolderId, name: CLOSED_SUBFOLDER },
    activeFolderCount: activeFolders.length,
    activeParseableCount: activeParsed.length,
    closedFolderCount: closedFolders.length,
    closedFolders: closedParsed.map((f) => ({
      folderId: f.id,
      folderName: f.name,
      claimNumber: f.parsed?.claimNumber ?? null,
      displayName: f.parsed?.displayName ?? null,
      parseable: f.parsed?.parseable ?? false,
      parseMethod: f.parsed?.parseMethod ?? "none",
      standardParseWorks: !!parseClientFolderName(f.name),
    })),
    activeFolders: activeParsed.map((f) => ({
      folderId: f.id,
      folderName: f.name,
      claimNumber: f.parsed!.claimNumber,
      displayName: f.parsed!.displayName,
    })),
  };

  const outPath = "scripts/closed-cases-scan.json";
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(
    `Active: ${output.activeFolderCount} folders (${output.activeParseableCount} parseable)`,
  );
  console.log(`Closed Cases: ${output.closedFolderCount} folders`);
  console.log(
    `Closed parseable (strip CLOSED): ${output.closedFolders.filter((f) => f.parseable).length}`,
  );
  console.log(
    `Closed standard parse works: ${output.closedFolders.filter((f) => f.standardParseWorks).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
