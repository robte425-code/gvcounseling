import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function ocrDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { ocrImageBuffer } = await import("../src/lib/google-vision-ocr");
  const imageBuffers: Buffer[] = [];
  await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement((image) =>
        image.read().then((imageBuffer) => {
          imageBuffers.push(Buffer.from(imageBuffer));
          return { src: "" };
        }),
      ),
    },
  );
  const parts: string[] = [];
  for (const imageBuffer of imageBuffers) parts.push(await ocrImageBuffer(imageBuffer));
  return parts.join("\n\n");
}

async function main() {
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { downloadFileBuffer, listClientFolderFiles } = await import("../src/lib/google-drive");
  const { prisma } = await import("../src/lib/prisma");

  const row = await prisma.client.findUnique({
    where: { lniClaimNumber: "BM27353" },
    select: { driveFolderId: true },
  });
  const { accessToken } = await getSystemDriveAccessToken();
  const file = (await listClientFolderFiles(accessToken, row!.driveFolderId!)).find((f) =>
    f.name.includes("Address"),
  )!;
  const text = await ocrDocx(await downloadFileBuffer(accessToken, file));

  const mod = await import("../src/lib/parse-lni-cac-fields");
  const parsed = mod.parseLniCacText(text, { warn: false });

  console.log("attendingDoctorName:", parsed.attendingDoctorName);
  console.log("clientName:", parsed.clientName);
  console.log("employerName:", parsed.employerName);

  await prisma.$disconnect();
}

main();
