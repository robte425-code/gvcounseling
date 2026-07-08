import {
  findDriveSubfolder,
  getDriveFolderParentIds,
  moveDriveFolder,
  resolveNewReferralsFolderId,
  resolveTherapistFolderForUser,
} from "@/lib/google-drive";
import { getSystemDriveAccessToken } from "@/lib/google-drive-system";
import { getTherapistDriveSourceForUser } from "@/lib/therapist-drive";

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

/** Move a client folder into the therapist's closed-cases subfolder. */
export async function moveClientDriveFolderToClosedCases(
  driveFolderId: string | null | undefined,
  therapistId: string,
  therapist: TherapistFolderTarget,
): Promise<void> {
  if (!driveFolderId) return;

  const source = await getTherapistDriveSourceForUser(therapistId);
  if (!source) {
    throw new Error("Therapist Drive folder is not configured.");
  }

  const { accessToken } = await getSystemDriveAccessToken();
  const therapistFolderId = await resolveTherapistFolderForUser(accessToken, therapist);
  const closedFolder = await findDriveSubfolder(
    accessToken,
    therapistFolderId,
    source.closedSubfolderName,
  );
  if (!closedFolder) {
    throw new Error(
      `Could not find "${source.closedSubfolderName}" folder under ${source.folderName}.`,
    );
  }

  const parents = await getDriveFolderParentIds(accessToken, driveFolderId);
  if (parents.includes(closedFolder.id)) return;

  await moveDriveFolder(accessToken, driveFolderId, closedFolder.id);
}

/** Move a client folder back to the shared New Referrals intake folder. */
export async function moveClientDriveFolderToNewReferrals(
  driveFolderId: string | null | undefined,
): Promise<void> {
  if (!driveFolderId) return;

  try {
    const { accessToken } = await getSystemDriveAccessToken();
    const newReferralsId = await resolveNewReferralsFolderId(accessToken);
    const parents = await getDriveFolderParentIds(accessToken, driveFolderId);
    if (parents.includes(newReferralsId)) return;

    await moveDriveFolder(accessToken, driveFolderId, newReferralsId);
  } catch (e) {
    console.error("Drive folder move to New Referrals failed:", e);
  }
}
