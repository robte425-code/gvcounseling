import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const claims = process.argv.slice(2).map((c) => c.trim().toUpperCase());
  const { prisma } = await import("../src/lib/prisma");
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { listClientFolderFiles } = await import("../src/lib/google-drive");

  for (const claim of claims) {
    const client = await prisma.client.findUnique({ where: { lniClaimNumber: claim } });
    if (!client) {
      console.log(claim, "NOT FOUND");
      continue;
    }
    console.log("\n===", claim, `${client.firstName} ${client.lastName}`, "===");
    console.log({
      attendingDoctorName: client.attendingDoctorName,
      attendingDoctorAddress: client.attendingDoctorAddress,
      attendingDoctorPhone: client.attendingDoctorPhone,
      diagnoses: client.diagnoses,
      driveFolderId: client.driveFolderId,
    });
    if (client.driveFolderId) {
      const { accessToken } = await getSystemDriveAccessToken();
      const files = await listClientFolderFiles(accessToken, client.driveFolderId);
      console.log("Files:");
      for (const f of files) console.log(`  ${f.name} (${f.mimeType})`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
