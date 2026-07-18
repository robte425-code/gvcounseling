import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { ensureClientDriveFolderSharedWithTherapist } from "@/lib/client-drive-move";
import { ensureClientDriveFolderMatchesClaim } from "@/lib/drive-client-import";
import type { ClientDriveFolderContents, DriveItemLink } from "@/lib/google-drive";
import { listClientDriveContents } from "@/lib/google-drive";
import { prisma } from "@/lib/prisma";

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
  options?: {
    therapistId?: string | null;
    initiatorUserId?: string;
    clientId?: string;
    claimNumber?: string;
  },
): Promise<ClientDriveContentsResult> {
  let folderId = driveFolderId;

  if (options?.clientId && options.claimNumber && options.initiatorUserId) {
    const healed = await ensureClientDriveFolderMatchesClaim({
      initiatorUserId: options.initiatorUserId,
      clientId: options.clientId,
      claimNumber: options.claimNumber,
      driveFolderId,
      therapistId: options.therapistId,
    });
    folderId = healed.driveFolderId;
    if (healed.warning && !folderId) {
      if (driveFolderId) {
        return {
          linked: true,
          folderName: null,
          folderLink: null,
          items: [],
          error: healed.warning,
        };
      }
      return {
        linked: false,
        folderName: null,
        folderLink: null,
        items: [],
        error: null,
      };
    }
  }

  if (!folderId) {
    return { linked: false, folderName: null, folderLink: null, items: [], error: null };
  }

  if (options?.therapistId) {
    const therapist = await prisma.user.findUnique({
      where: { id: options.therapistId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (therapist) {
      await ensureClientDriveFolderSharedWithTherapist(folderId, therapist);
    }
  }

  try {
    const accessToken = await getDriveAccessTokenForClient({
      therapistId: options?.therapistId,
      initiatorUserId: options?.initiatorUserId,
    });
    const contents: ClientDriveFolderContents = await listClientDriveContents(
      accessToken,
      folderId,
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
