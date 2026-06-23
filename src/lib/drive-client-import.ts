import {
  downloadReferralDocx,
  findReferralSubmissionFile,
  getTherapistFolderConfig,
  listClientFolders,
  parseClientFolderName,
  resolveTherapistFolderId,
} from "@/lib/google-drive";
import { getValidGoogleAccessToken } from "@/lib/google-oauth";
import { upsertClientFromReferral } from "@/lib/import-referral-client";
import { parseReferralDocx } from "@/lib/referral-parser";
import { prisma } from "@/lib/prisma";

export type DriveImportResult = {
  created: number;
  updated: number;
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

    const buffer = await downloadReferralDocx(accessToken, referralFile);
    const parsed = await parseReferralDocx(buffer);

    if (!parsed.claimNumber && parsedFolder.claimNumber) {
      parsed.claimNumber = parsedFolder.claimNumber;
    }

    const importResult = await upsertClientFromReferral(parsed, target.therapistId);
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
  into.skipped += part.skipped;
  into.errors.push(...part.errors);
  into.warnings.push(...part.warnings);
}

export async function importClientsFromGoogleDrive(userId: string): Promise<DriveImportResult> {
  const { folders, errors } = await scanDriveClientFolders(userId);
  const result: DriveImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [...errors],
    warnings: [],
  };

  for (const folder of folders) {
    mergeResults(result, await importDriveClientFolder(userId, folder));
  }

  return result;
}
