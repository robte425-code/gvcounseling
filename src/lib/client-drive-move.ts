import {
  getDriveFolderParentIds,
  moveDriveFolder,
  resolveTherapistFolderForUser,
} from "@/lib/google-drive";
import { getSystemDriveAccessToken } from "@/lib/google-drive-system";

type TherapistFolderTarget = {
  email: string;
  firstName: string;
  lastName: string;
};

/** Move a client folder (and all contents) under the therapist's Drive folder. */
export async function moveClientDriveFolderToTherapist(
  driveFolderId: string | null | undefined,
  therapist: TherapistFolderTarget,
): Promise<void> {
  if (!driveFolderId) return;

  try {
    const { accessToken } = await getSystemDriveAccessToken();
    const therapistFolderId = await resolveTherapistFolderForUser(accessToken, therapist);
    const parents = await getDriveFolderParentIds(accessToken, driveFolderId);
    if (parents.includes(therapistFolderId)) return;

    await moveDriveFolder(accessToken, driveFolderId, therapistFolderId);
  } catch (e) {
    console.error("Drive folder move to therapist failed:", e);
  }
}
