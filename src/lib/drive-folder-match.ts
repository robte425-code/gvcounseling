import { parseClientFolderName } from "@/lib/google-drive";

export type ClaimFolderCandidate = {
  folderId: string;
  folderName: string;
  fromClosedCases?: boolean;
};

/** Prefer a Drive folder whose name matches the claim; only fall back to a stored id. */
export function findDriveFolderForClaim<T extends ClaimFolderCandidate>(
  folders: T[],
  claimNumber: string,
  preferredFolderId?: string | null,
): T | null {
  const claim = claimNumber.trim().toUpperCase();
  const claimMatches = folders.filter((folder) => {
    const parsed = parseClientFolderName(folder.folderName);
    return parsed?.claimNumber === claim;
  });

  if (claimMatches.length) {
    if (preferredFolderId) {
      const preferred = claimMatches.find((folder) => folder.folderId === preferredFolderId);
      if (preferred) return preferred;
    }
    return claimMatches.find((folder) => !folder.fromClosedCases) ?? claimMatches[0] ?? null;
  }

  if (preferredFolderId) {
    return folders.find((folder) => folder.folderId === preferredFolderId) ?? null;
  }

  return null;
}
