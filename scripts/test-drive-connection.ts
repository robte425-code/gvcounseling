import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getSystemDriveAccessToken } from "../src/lib/google-drive-system";
import { listLniRemittanceAdvicePdfs } from "../src/lib/lni-remittance-drive";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL?.trim() || "ghim@gvcounseling.com";
  const conn = await prisma.googleDriveConnection.findFirst({
    where: { user: { email } },
    select: { googleEmail: true, expiresAt: true },
  });

  console.log("System user:", email);
  console.log("DB connection:", conn);

  const { accessToken } = await getSystemDriveAccessToken();
  console.log("Access token obtained:", accessToken.slice(0, 12) + "...");

  const files = await listLniRemittanceAdvicePdfs(accessToken);
  console.log("RA PDFs on Drive:", files.length);
  console.log(
    "Latest 3:",
    files.slice(-3).map((f) => f.name),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
