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

type TherapistFolder = {
  therapistId: string;
  therapistName: string;
  folderId: string | null;
  folderName: string;
};

export async function importClientsFromGoogleDrive(userId: string): Promise<DriveImportResult> {
  const accessToken = await getValidGoogleAccessToken(userId);
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

  const sources: TherapistFolder[] = [
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

  const result: DriveImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    warnings: [],
  };

  for (const source of sources) {
    let parentFolderId: string;
    try {
      parentFolderId = await resolveTherapistFolderId(accessToken, source.folderId, source.folderName);
    } catch (e) {
      result.errors.push(
        `${source.therapistName}: ${e instanceof Error ? e.message : "Could not find client folder."}`,
      );
      continue;
    }

    const clientFolders = await listClientFolders(accessToken, parentFolderId);

    for (const folder of clientFolders) {
      const folderLabel = `${source.therapistName}/${folder.name}`;
      const parsedFolder = parseClientFolderName(folder.name);

      if (!parsedFolder) {
        result.skipped++;
        result.warnings.push(`${folderLabel}: skipped (folder name is not "<claim #> - <client name>").`);
        continue;
      }

      try {
        const referralFile = await findReferralSubmissionFile(accessToken, folder.id);
        if (!referralFile) {
          result.skipped++;
          result.warnings.push(`${folderLabel}: no Referral Submission file found.`);
          continue;
        }

        const buffer = await downloadReferralDocx(accessToken, referralFile);
        const parsed = await parseReferralDocx(buffer);

        if (!parsed.claimNumber && parsedFolder.claimNumber) {
          parsed.claimNumber = parsedFolder.claimNumber;
        }

        const importResult = await upsertClientFromReferral(parsed, source.therapistId);
        if (importResult.error) {
          result.skipped++;
          result.errors.push(`${folderLabel}: ${importResult.error}`);
          continue;
        }

        result.created += importResult.created;
        result.updated += importResult.updated;
        for (const warning of importResult.warnings) {
          result.warnings.push(`${folderLabel}: ${warning}`);
        }
      } catch (e) {
        result.skipped++;
        result.errors.push(`${folderLabel}: ${e instanceof Error ? e.message : "Import failed."}`);
      }
    }
  }

  return result;
}
