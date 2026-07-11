import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const claim = process.argv[2]?.trim().toUpperCase();
  const filenamePart = process.argv.slice(3).join(" ");
  if (!claim || !filenamePart) {
    console.error("Usage: npx tsx scripts/ocr-client-file.ts <CLAIM> <filename substring>");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { listClientFolderFiles, downloadFileBuffer } = await import("../src/lib/google-drive");
  const { ocrImageBuffer } = await import("../src/lib/google-vision-ocr");
  const { extractPdfText } = await import("../src/lib/pdf-text");
  const mammoth = (await import("mammoth")).default;

  const client = await prisma.client.findUnique({
    where: { lniClaimNumber: claim },
    select: { driveFolderId: true },
  });
  if (!client?.driveFolderId) throw new Error(`No drive folder for ${claim}`);

  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listClientFolderFiles(accessToken, client.driveFolderId);
  const file = files.find((f) => f.name.includes(filenamePart));
  if (!file) throw new Error(`File not found matching: ${filenamePart}`);

  const buffer = await downloadFileBuffer(accessToken, file);
  let text = "";
  if (/png|jpe?g|webp|gif/i.test(file.mimeType) || /\.png$/i.test(file.name)) {
    text = await ocrImageBuffer(buffer);
  } else if (/pdf/i.test(file.mimeType)) {
    text = (await extractPdfText(buffer)).text;
  } else if (/word|docx/i.test(file.mimeType) || file.name.endsWith(".docx")) {
    text = (await mammoth.extractRawText({ buffer })).value;
  }

  console.log(`=== ${file.name} (${text.length} chars) ===\n`);
  console.log(text);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
