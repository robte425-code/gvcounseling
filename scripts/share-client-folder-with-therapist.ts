import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { parseClaimNumber } = await import("../src/lib/constants");
  const {
    ensureClientDriveFolderSharedWithTherapist,
    moveClientDriveFolderToTherapist,
  } = await import("../src/lib/client-drive-move");
  const { prisma } = await import("../src/lib/prisma");

  const claimNumber = parseClaimNumber(process.argv[2] ?? "");
  const therapistEmail = (process.argv[3] ?? "maria@gvcounseling.com").trim().toLowerCase();

  if (!claimNumber) {
    throw new Error("Usage: tsx scripts/share-client-folder-with-therapist.ts <claimNumber> [therapistEmail]");
  }

  const [client, therapist] = await Promise.all([
    prisma.client.findUnique({
      where: { lniClaimNumber: claimNumber },
      select: {
        id: true,
        lniClaimNumber: true,
        firstName: true,
        lastName: true,
        driveFolderId: true,
        therapistId: true,
        assignmentStatus: true,
      },
    }),
    prisma.user.findFirst({
      where: { email: therapistEmail, role: "THERAPIST", active: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
  ]);

  if (!client) throw new Error(`Client not found for claim ${claimNumber}.`);
  if (!therapist) throw new Error(`Therapist not found: ${therapistEmail}`);
  if (!client.driveFolderId) {
    throw new Error(`Client ${claimNumber} has no linked Drive folder.`);
  }

  console.log("Client:", `${client.lastName}, ${client.firstName}`, client.lniClaimNumber);
  console.log("Drive folder id:", client.driveFolderId);
  console.log("Therapist:", `${therapist.firstName} ${therapist.lastName}`, therapist.email);
  console.log(
    "Assignment:",
    client.assignmentStatus,
    client.therapistId === therapist.id ? "(assigned)" : "(not assigned to this therapist)",
  );

  await moveClientDriveFolderToTherapist(client.driveFolderId, therapist);
  await ensureClientDriveFolderSharedWithTherapist(client.driveFolderId, therapist);

  console.log("Done. Folder moved (if needed) and shared with therapist.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
