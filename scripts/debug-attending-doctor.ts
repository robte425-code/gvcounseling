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
  for (const imageBuffer of imageBuffers) {
    parts.push(await ocrImageBuffer(imageBuffer));
  }
  return parts.join("\n\n");
}

async function main() {
  const claim = process.argv[2]?.trim().toUpperCase() ?? "BM27353";
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { downloadFileBuffer, listClientFolderFiles } = await import("../src/lib/google-drive");
  const { parseLniClaimStatusText } = await import("../src/lib/parse-lni-claim-status");
  const { parseLniAddressesText } = await import("../src/lib/parse-lni-addresses");
  const { parseLniCacText } = await import("../src/lib/parse-lni-cac-fields");
  const { extractPdfText } = await import("../src/lib/pdf-text");
  const { prisma } = await import("../src/lib/prisma");

  const row = await prisma.client.findUnique({
    where: { lniClaimNumber: claim },
    select: { driveFolderId: true },
  });
  if (!row?.driveFolderId) throw new Error(`No drive folder for ${claim}`);

  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listClientFolderFiles(accessToken, row.driveFolderId);

  for (const file of files) {
    const buffer = await downloadFileBuffer(accessToken, file);
    const text = file.name.endsWith(".docx")
      ? await ocrDocx(buffer)
      : (await extractPdfText(buffer)).text;

    const claimParsed = parseLniClaimStatusText(text, { warn: false });
    const addrParsed = parseLniAddressesText(text, { warn: false });
    const cacParsed = parseLniCacText(text, { warn: false });

    console.log(`\n==== ${file.name} (${text.length} chars) ====`);
    const snippet = text.match(/Attending doctor[\s\S]{0,250}/i);
    if (snippet) console.log("Attending snippet:\n", snippet[0]);
    else console.log("(no 'Attending doctor' label in OCR text)");
    console.log("cac parser doctor:", cacParsed.attendingDoctorName);
    console.log("plausible doctor:", (await import("../src/lib/client-import-quality")).isPlausibleDoctorName(cacParsed.attendingDoctorName));
    console.log("claim parser doctor:", claimParsed.attendingDoctorName);
    console.log("addresses parser doctor:", addrParsed.attendingDoctorName);
    console.log("worker name:", claimParsed.clientName ?? addrParsed.clientName);
    if (file.name.includes("Address")) {
      console.log("\nFull OCR text:\n", text);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
