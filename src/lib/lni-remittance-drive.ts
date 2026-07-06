import {
  downloadFileBuffer,
  findDriveFolderByName,
  listClientFolderFilesWithLinks,
  resolveTherapistFolderId,
  resolveTherapistParentFolderId,
  type DriveFile,
} from "@/lib/google-drive";

export const LNI_RAS_FOLDER_NAME = "LNI RAs";

const REMITTANCE_FILENAME =
  /^RemittanceAdvice_(\d+)_(\d+)\.pdf$/i;

export function getLniRasFolderConfig() {
  return {
    folderId: process.env.GOOGLE_DRIVE_LNI_RAS_FOLDER_ID?.trim() || null,
    folderName: process.env.GOOGLE_DRIVE_LNI_RAS_FOLDER_NAME?.trim() || LNI_RAS_FOLDER_NAME,
  };
}

/** Parse RA date suffix from filenames like RemittanceAdvice_0479998_4282026.pdf */
export function parseRemittanceAdviceFilenameDate(filename: string): Date | null {
  const match = filename.match(REMITTANCE_FILENAME);
  if (!match) return null;

  const dateCode = match[2]!;
  const yearMatch = dateCode.match(/(\d{4})$/);
  if (!yearMatch) return null;

  const year = Number.parseInt(yearMatch[1]!, 10);
  const prefix = dateCode.slice(0, -4);
  if (!prefix || !/^\d+$/.test(prefix)) return null;

  let month: number;
  let day: number;

  if (prefix.length === 4) {
    month = Number.parseInt(prefix.slice(0, 2), 10);
    day = Number.parseInt(prefix.slice(2), 10);
  } else if (prefix.length === 3) {
    month = Number.parseInt(prefix[0]!, 10);
    day = Number.parseInt(prefix.slice(1), 10);
  } else if (prefix.length === 2) {
    month = Number.parseInt(prefix[0]!, 10);
    day = Number.parseInt(prefix[1]!, 10);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function remittanceFilenameSortKey(filename: string): number {
  const date = parseRemittanceAdviceFilenameDate(filename);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

export function sortRemittanceFilenames(filenames: string[]): string[] {
  return [...filenames].sort((a, b) => {
    const dateDiff = remittanceFilenameSortKey(a) - remittanceFilenameSortKey(b);
    if (dateDiff !== 0) return dateDiff;
    return a.localeCompare(b);
  });
}

export function sortRemittanceDriveFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const dateDiff = remittanceFilenameSortKey(a.name) - remittanceFilenameSortKey(b.name);
    if (dateDiff !== 0) return dateDiff;
    return a.name.localeCompare(b.name);
  });
}

export async function resolveLniRasFolderId(accessToken: string): Promise<string> {
  const config = getLniRasFolderConfig();
  if (config.folderId) return config.folderId;

  const parentId = await resolveTherapistParentFolderId(accessToken);
  const inParent = await findDriveFolderByName(accessToken, parentId, config.folderName);
  if (inParent) return inParent;

  return resolveTherapistFolderId(accessToken, null, config.folderName);
}

export async function listLniRemittanceAdvicePdfs(
  accessToken: string,
): Promise<(DriveFile & { webViewLink: string })[]> {
  const folderId = await resolveLniRasFolderId(accessToken);
  const files = await listClientFolderFilesWithLinks(accessToken, folderId);
  return sortRemittanceDriveFiles(
    files.filter((file) => REMITTANCE_FILENAME.test(file.name)),
  );
}

export async function downloadLniRemittancePdf(
  accessToken: string,
  file: Pick<DriveFile, "id" | "name" | "mimeType">,
): Promise<Buffer> {
  return downloadFileBuffer(accessToken, {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
  });
}
