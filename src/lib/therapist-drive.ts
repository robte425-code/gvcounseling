import { getTherapistFolderConfig, therapistDriveFolderName } from "@/lib/google-drive";
import { prisma } from "@/lib/prisma";

export type TherapistDriveSource = {
  therapistId: string;
  therapistName: string;
  folderId: string | null;
  folderName: string;
};

function folderConfigForTherapist(user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}): TherapistDriveSource | null {
  const folderConfig = getTherapistFolderConfig();
  if (user.email === "maria@gvcounseling.com" || user.firstName === "Maria") {
    return {
      therapistId: user.id,
      therapistName: `${user.firstName} ${user.lastName}`,
      folderId: folderConfig.maria.folderId,
      folderName: folderConfig.maria.folderName,
    };
  }
  if (user.email === "steven@gvcounseling.com" || user.firstName === "Steven") {
    return {
      therapistId: user.id,
      therapistName: `${user.firstName} ${user.lastName}`,
      folderId: folderConfig.steven.folderId,
      folderName: folderConfig.steven.folderName,
    };
  }
  return {
    therapistId: user.id,
    therapistName: `${user.firstName} ${user.lastName}`,
    folderId: null,
    folderName: therapistDriveFolderName(user.firstName, user.lastName),
  };
}

export async function getTherapistDriveSourceForUser(
  userId: string,
): Promise<TherapistDriveSource | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId, role: "THERAPIST" },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!user) return null;
  return folderConfigForTherapist(user);
}

export async function getAllTherapistDriveSources(): Promise<TherapistDriveSource[]> {
  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST", active: true },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const sources: TherapistDriveSource[] = [];
  for (const therapist of therapists) {
    const source = folderConfigForTherapist(therapist);
    if (source) sources.push(source);
  }

  if (!sources.length) {
    throw new Error("At least one therapist account must exist before importing from Drive.");
  }

  return sources;
}
