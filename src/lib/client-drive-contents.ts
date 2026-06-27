import { getSystemDriveAccessToken } from "@/lib/google-drive-system";
import type { ClientDriveFolderContents, DriveItemLink } from "@/lib/google-drive";
import { listClientDriveContents } from "@/lib/google-drive";

export type ClientDriveContentsResult =
  | { linked: false; folderName: null; folderLink: null; items: DriveItemLink[]; error: null }
  | {
      linked: true;
      folderName: string | null;
      folderLink: string | null;
      items: DriveItemLink[];
      error: string | null;
    };

export async function loadClientDriveContents(
  driveFolderId: string | null,
): Promise<ClientDriveContentsResult> {
  if (!driveFolderId) {
    return { linked: false, folderName: null, folderLink: null, items: [], error: null };
  }

  try {
    const { accessToken } = await getSystemDriveAccessToken();
    const contents: ClientDriveFolderContents = await listClientDriveContents(
      accessToken,
      driveFolderId,
    );
    return {
      linked: true,
      folderName: contents.folderName,
      folderLink: contents.folderLink,
      items: contents.items,
      error: null,
    };
  } catch (e) {
    return {
      linked: true,
      folderName: null,
      folderLink: null,
      items: [],
      error: e instanceof Error ? e.message : "Could not load Google Drive files.",
    };
  }
}
