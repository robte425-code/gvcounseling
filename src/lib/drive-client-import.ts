import {
  downloadReferralDocx,
  findReferralSubmissionFile,
  listClientFolders,
  parseClientFolderName,
  resolveTherapistFolderId,
  resolveTherapistFolderInParent,
  resolveTherapistParentFolderId,
} from "@/lib/google-drive";
import { resolveOAuthUserIdForTherapist } from "@/lib/google-drive-access";
import { resolveImportClaimNumber } from "@/lib/constants";
import { getValidGoogleAccessToken } from "@/lib/google-oauth";
import { importClientDocumentsFromFolderDetailed } from "@/lib/client-document-import";
import { upsertClientFromReferral } from "@/lib/import-referral-client";
import { parseReferralDocx } from "@/lib/referral-parser";
import {
  getAllTherapistDriveSources,
  getTherapistDriveSourceForUser,
  type TherapistDriveSource,
} from "@/lib/therapist-drive";
import { prisma } from "@/lib/prisma";

export type DriveImportResult = {
  created: number;
  updated: number;
  closed: number;
  unchanged: number;
  skipped: number;
  errors: string[];
  warnings: string[];
};

export type DriveFolderTarget = {
  folderId: string;
  folderName: string;
  therapistId: string;
  therapistName: string;
};

async function scanTherapistDriveSource(
  source: TherapistDriveSource,
  oauthUserId: string,
): Promise<{ folders: DriveFolderTarget[]; errors: string[] }> {
  const folders: DriveFolderTarget[] = [];
  const errors: string[] = [];

  try {
    const accessToken = await getValidGoogleAccessToken(oauthUserId);
    let parentFolderId: string;
    if (source.folderId) {
      parentFolderId = await resolveTherapistFolderId(
        accessToken,
        source.folderId,
        source.folderName,
      );
    } else {
      const therapistParentId = await resolveTherapistParentFolderId(accessToken);
      parentFolderId = await resolveTherapistFolderInParent(
        accessToken,
        therapistParentId,
        source.folderName,
      );
    }
    const clientFolders = await listClientFolders(accessToken, parentFolderId);

    for (const folder of clientFolders) {
      if (!parseClientFolderName(folder.name)) continue;
      folders.push({
        folderId: folder.id,
        folderName: folder.name,
        therapistId: source.therapistId,
        therapistName: source.therapistName,
      });
    }
  } catch (e) {
    errors.push(
      `${source.therapistName}: ${e instanceof Error ? e.message : "Could not list client folders."}`,
    );
  }

  return { folders, errors };
}

export async function scanDriveClientFolders(initiatorUserId: string): Promise<{
  folders: DriveFolderTarget[];
  errors: string[];
}> {
  const sources = await getAllTherapistDriveSources();
  const folders: DriveFolderTarget[] = [];
  const errors: string[] = [];

  for (const source of sources) {
    const oauthUserId = await resolveOAuthUserIdForTherapist(
      source.therapistId,
      initiatorUserId,
    );
    const scan = await scanTherapistDriveSource(source, oauthUserId);
    folders.push(...scan.folders);
    errors.push(...scan.errors);
  }

  return { folders, errors };
}

export async function scanTherapistDriveClientFolders(therapistUserId: string): Promise<{
  folders: DriveFolderTarget[];
  errors: string[];
}> {
  const source = await getTherapistDriveSourceForUser(therapistUserId);
  if (!source) {
    return {
      folders: [],
      errors: ["Your account is not configured for a Google Drive client folder."],
    };
  }

  return scanTherapistDriveSource(source, therapistUserId);
}

export async function importDriveClientFolder(
  oauthUserId: string,
  target: Pick<DriveFolderTarget, "folderId" | "folderName" | "therapistId" | "therapistName">,
): Promise<DriveImportResult> {
  const accessToken = await getValidGoogleAccessToken(oauthUserId);
  const folderLabel = `${target.therapistName}/${target.folderName}`;
  const parsedFolder = parseClientFolderName(target.folderName);

  const result: DriveImportResult = {
    created: 0,
    updated: 0,
    closed: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
    warnings: [],
  };

  if (!parsedFolder) {
    result.skipped = 1;
    result.warnings.push(`${folderLabel}: skipped (folder name is not "<claim #> - <client name>").`);
    return result;
  }

  try {
    const referralFile = await findReferralSubmissionFile(accessToken, target.folderId);
    if (!referralFile) {
      result.skipped = 1;
      result.warnings.push(`${folderLabel}: no Referral Submission file found.`);
      return result;
    }

    const [buffer, { merged: supplement, parts }] = await Promise.all([
      downloadReferralDocx(accessToken, referralFile),
      importClientDocumentsFromFolderDetailed(accessToken, target.folderId),
    ]);
    const parsed = await parseReferralDocx(buffer);

    const resolvedClaim = resolveImportClaimNumber(
      parsedFolder.claimNumber,
      parsed.claimNumber,
      supplement.claimNumber,
    );
    parsed.claimNumber = resolvedClaim.claimNumber;
    parsed.warnings.push(...resolvedClaim.warnings);
    if (parsed.claimNumber) {
      parsed.warnings = parsed.warnings.filter((w) => !/Could not find L&I claim number/i.test(w));
    }

    const importResult = await upsertClientFromReferral(parsed, target.therapistId, {
      folderDisplayName: parsedFolder.displayName,
      folderClaimNumber: parsedFolder.claimNumber,
      driveFolderId: target.folderId,
      supplement,
      documentParts: parts,
    });
    if (importResult.error) {
      result.skipped = 1;
      result.errors.push(`${folderLabel}: ${importResult.error}`);
      return result;
    }

    result.created = importResult.created;
    result.updated = importResult.updated;
    for (const warning of importResult.warnings) {
      result.warnings.push(`${folderLabel}: ${warning}`);
    }
  } catch (e) {
    result.skipped = 1;
    result.errors.push(`${folderLabel}: ${e instanceof Error ? e.message : "Import failed."}`);
  }

  return result;
}

function mergeResults(into: DriveImportResult, part: DriveImportResult) {
  into.created += part.created;
  into.updated += part.updated;
  into.closed += part.closed;
  into.unchanged += part.unchanged;
  into.skipped += part.skipped;
  into.errors.push(...part.errors);
  into.warnings.push(...part.warnings);
}

function emptyDriveImportResult(errors: string[] = []): DriveImportResult {
  return {
    created: 0,
    updated: 0,
    closed: 0,
    unchanged: 0,
    skipped: 0,
    errors,
    warnings: [],
  };
}

async function closeClientMissingFromDrive(clientId: string): Promise<void> {
  await prisma.client.update({
    where: { id: clientId },
    data: {
      assignmentStatus: "CLOSED",
      closedAt: new Date(),
      driveFolderId: null,
    },
  });
}

function reopenStatusForClient(therapistId: string | null): "ACTIVE" | "UNASSIGNED" {
  return therapistId ? "ACTIVE" : "UNASSIGNED";
}

async function syncDriveFolders(
  initiatorUserId: string,
  folders: DriveFolderTarget[],
  errors: string[],
  options: { therapistIds: string[]; scopeTherapistId?: string },
): Promise<DriveImportResult> {
  const result = emptyDriveImportResult([...errors]);
  const therapistIds = options.scopeTherapistId ? [options.scopeTherapistId] : options.therapistIds;
  const driveFolderIds = new Set(folders.map((f) => f.folderId));

  const trackedClients = await prisma.client.findMany({
    where: {
      OR: [
        { driveFolderId: { not: null }, therapistId: { in: therapistIds } },
        { therapistId: { in: therapistIds } },
      ],
    },
    select: {
      id: true,
      lniClaimNumber: true,
      therapistId: true,
      driveFolderId: true,
      assignmentStatus: true,
    },
  });

  const clientByClaim = new Map(trackedClients.map((c) => [c.lniClaimNumber, c]));

  for (const folder of folders) {
    const parsedFolder = parseClientFolderName(folder.folderName);
    if (!parsedFolder) {
      result.skipped++;
      continue;
    }

    const existing = clientByClaim.get(parsedFolder.claimNumber);
    const oauthUserId = await resolveOAuthUserIdForTherapist(folder.therapistId, initiatorUserId);

    if (existing?.assignmentStatus === "CLOSED") {
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          driveFolderId: folder.folderId,
          assignmentStatus: reopenStatusForClient(existing.therapistId),
          closedAt: null,
        },
      });
      existing.driveFolderId = folder.folderId;
      existing.assignmentStatus = reopenStatusForClient(existing.therapistId);
      result.updated++;
      continue;
    }

    if (existing?.driveFolderId === folder.folderId) {
      result.unchanged++;
      continue;
    }

    if (existing) {
      if (!existing.driveFolderId) {
        await prisma.client.update({
          where: { id: existing.id },
          data: { driveFolderId: folder.folderId },
        });
        existing.driveFolderId = folder.folderId;
        result.unchanged++;
        continue;
      }

      result.skipped++;
      result.warnings.push(
        `${folder.folderName}: claim ${parsedFolder.claimNumber} is linked to a different Drive folder; skipped.`,
      );
      continue;
    }

    mergeResults(result, await importDriveClientFolder(oauthUserId, folder));
    const created = await prisma.client.findUnique({
      where: { lniClaimNumber: parsedFolder.claimNumber },
      select: {
        id: true,
        lniClaimNumber: true,
        therapistId: true,
        driveFolderId: true,
        assignmentStatus: true,
      },
    });
    if (created) clientByClaim.set(created.lniClaimNumber, created);
  }

  for (const client of trackedClients) {
    if (
      client.assignmentStatus === "CLOSED" ||
      !client.driveFolderId ||
      !client.therapistId ||
      !therapistIds.includes(client.therapistId)
    ) {
      continue;
    }
    if (driveFolderIds.has(client.driveFolderId)) continue;

    await closeClientMissingFromDrive(client.id);
    result.closed++;
    clientByClaim.delete(client.lniClaimNumber);
  }

  return result;
}

/** Import new Drive folders and close clients whose Drive folder was deleted. Skips unchanged folders. */
export async function syncClientsFromGoogleDrive(initiatorUserId: string): Promise<DriveImportResult> {
  const { folders, errors } = await scanDriveClientFolders(initiatorUserId);
  const sources = await getAllTherapistDriveSources();

  if (!folders.length && !errors.length) {
    return emptyDriveImportResult();
  }

  return syncDriveFolders(initiatorUserId, folders, errors, {
    therapistIds: sources.map((s) => s.therapistId),
  });
}

/** Re-import one client's Drive folder (referral doc + CAC PDFs) and update the DB record. */
export async function resyncClientFromDrive(
  initiatorUserId: string,
  clientId: string,
): Promise<DriveImportResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { lniClaimNumber: true, driveFolderId: true, therapistId: true },
  });
  if (!client) {
    return emptyDriveImportResult(["Client not found."]);
  }

  let folders: DriveFolderTarget[] = [];
  let errors: string[] = [];

  if (client.therapistId) {
    const source = await getTherapistDriveSourceForUser(client.therapistId);
    if (source) {
      const oauthUserId = await resolveOAuthUserIdForTherapist(
        client.therapistId,
        initiatorUserId,
      );
      const scan = await scanTherapistDriveSource(source, oauthUserId);
      folders = scan.folders;
      errors = scan.errors;
    }
  }

  if (!folders.length) {
    const scan = await scanDriveClientFolders(initiatorUserId);
    folders = scan.folders;
    errors = [...errors, ...scan.errors];
  }

  const folder =
    (client.driveFolderId && folders.find((f) => f.folderId === client.driveFolderId)) ??
    folders.find((f) => f.folderName.startsWith(`${client.lniClaimNumber} `));

  if (!folder) {
    return {
      ...emptyDriveImportResult([
        ...errors,
        `No Drive folder found for claim ${client.lniClaimNumber}.`,
      ]),
      skipped: 1,
    };
  }

  const oauthUserId = await resolveOAuthUserIdForTherapist(folder.therapistId, initiatorUserId);
  const result = emptyDriveImportResult([...errors]);
  mergeResults(result, await importDriveClientFolder(oauthUserId, folder));
  return result;
}

export async function importClientsFromGoogleDrive(userId: string): Promise<DriveImportResult> {
  return syncClientsFromGoogleDrive(userId);
}
