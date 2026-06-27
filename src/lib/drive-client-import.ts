import {
  downloadReferralDocx,
  findReferralSubmissionFile,
  getTherapistFolderConfig,
  listClientFolders,
  parseClientFolderName,
  resolveTherapistFolderId,
} from "@/lib/google-drive";
import { resolveImportClaimNumber } from "@/lib/constants";
import { getValidGoogleAccessToken } from "@/lib/google-oauth";
import { importClientDocumentsFromFolderDetailed } from "@/lib/client-document-import";
import { upsertClientFromReferral } from "@/lib/import-referral-client";
import { parseReferralDocx } from "@/lib/referral-parser";
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

type TherapistFolder = {
  therapistId: string;
  therapistName: string;
  folderId: string | null;
  folderName: string;
};

async function getTherapistSources(): Promise<TherapistFolder[]> {
  const folderConfig = getTherapistFolderConfig();
  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST" },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const maria = therapists.find((t) => t.email === "maria@gvcounseling.com" || t.firstName === "Maria");
  const steven = therapists.find((t) => t.email === "steven@gvcounseling.com" || t.firstName === "Steven");

  if (!maria || !steven) {
    throw new Error("Maria and Steven therapist accounts must exist before importing from Drive.");
  }

  return [
    {
      therapistId: maria.id,
      therapistName: `${maria.firstName} ${maria.lastName}`,
      folderId: folderConfig.maria.folderId,
      folderName: folderConfig.maria.folderName,
    },
    {
      therapistId: steven.id,
      therapistName: `${steven.firstName} ${steven.lastName}`,
      folderId: folderConfig.steven.folderId,
      folderName: folderConfig.steven.folderName,
    },
  ];
}

export async function scanDriveClientFolders(userId: string): Promise<{
  folders: DriveFolderTarget[];
  errors: string[];
}> {
  const accessToken = await getValidGoogleAccessToken(userId);
  const sources = await getTherapistSources();
  const folders: DriveFolderTarget[] = [];
  const errors: string[] = [];

  for (const source of sources) {
    try {
      const parentFolderId = await resolveTherapistFolderId(
        accessToken,
        source.folderId,
        source.folderName,
      );
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
  }

  return { folders, errors };
}

export async function importDriveClientFolder(
  userId: string,
  target: Pick<DriveFolderTarget, "folderId" | "folderName" | "therapistId" | "therapistName">,
): Promise<DriveImportResult> {
  const accessToken = await getValidGoogleAccessToken(userId);
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

/** Import new Drive folders and close clients whose Drive folder was deleted. Skips unchanged folders. */
export async function syncClientsFromGoogleDrive(userId: string): Promise<DriveImportResult> {
  const { folders, errors } = await scanDriveClientFolders(userId);
  const result = emptyDriveImportResult([...errors]);

  if (!folders.length && !errors.length) {
    return result;
  }

  const sources = await getTherapistSources();
  const therapistIds = sources.map((s) => s.therapistId);
  const driveFolderIds = new Set(folders.map((f) => f.folderId));

  const trackedClients = await prisma.client.findMany({
    where: {
      OR: [
        { driveFolderId: { not: null } },
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

    mergeResults(result, await importDriveClientFolder(userId, folder));
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

/** Re-import one client's Drive folder (referral doc + CAC PDFs) and update the DB record. */
export async function resyncClientFromDrive(
  userId: string,
  clientId: string,
): Promise<DriveImportResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { lniClaimNumber: true, driveFolderId: true },
  });
  if (!client) {
    return emptyDriveImportResult(["Client not found."]);
  }

  const { folders, errors } = await scanDriveClientFolders(userId);
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

  const result = emptyDriveImportResult([...errors]);
  mergeResults(result, await importDriveClientFolder(userId, folder));
  return result;
}

export async function importClientsFromGoogleDrive(userId: string): Promise<DriveImportResult> {
  return syncClientsFromGoogleDrive(userId);
}
