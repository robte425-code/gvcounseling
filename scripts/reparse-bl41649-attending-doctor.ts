/**
 * One-shot: re-parse BL41649 Drive docs and save attending doctor name.
 * Runs once on production build via PortalSetting marker.
 *
 * Manual:
 *   FORCE_REPARSE_BL41649=1 npx tsx scripts/reparse-bl41649-attending-doctor.ts
 */
import "dotenv/config";

const CLAIM = "BL41649";
const DONE_KEY = "reparse_bl41649_attending_doctor_20260731_done";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("reparse-bl41649: DATABASE_URL not set — skipping");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  const force = process.env.FORCE_REPARSE_BL41649?.trim() === "1";

  if (!force) {
    const done = await prisma.portalSetting.findUnique({
      where: { key: DONE_KEY },
      select: { value: true },
    });
    if (done) {
      console.log("reparse-bl41649: already completed — skipping");
      await prisma.$disconnect();
      return;
    }
  }

  const client = await prisma.client.findUnique({
    where: { lniClaimNumber: CLAIM },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      attendingDoctorName: true,
      claimManagerName: true,
      driveFolderId: true,
      lniClaimNumber: true,
    },
  });

  if (!client) {
    console.log(`reparse-bl41649: client ${CLAIM} not found — skipping`);
    await prisma.$disconnect();
    return;
  }

  console.log(
    `reparse-bl41649: ${client.lastName}, ${client.firstName} doctor=${client.attendingDoctorName ?? "(empty)"} cm=${client.claimManagerName ?? "(empty)"}`,
  );

  // Reuse the existing reparse script logic via child process would be heavy;
  // inline the essential Drive reparse path.
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const {
    downloadFileBuffer,
    listClientFolderFiles,
    listClientFolders,
    resolveNewReferralsFolderId,
  } = await import("../src/lib/google-drive");
  const { importClientDocumentsFromFolderDetailed } = await import(
    "../src/lib/client-document-import"
  );
  const { validateAndRepairClientImport } = await import("../src/lib/client-import-quality");
  const mammoth = (await import("mammoth")).default;
  const { parseContactAddressesDocxText } = await import(
    "../src/lib/parse-contact-addresses-docx"
  );

  const { accessToken } = await getSystemDriveAccessToken();

  let folderId = client.driveFolderId;
  if (!folderId) {
    const referralsFolderId = await resolveNewReferralsFolderId(accessToken);
    const folders = await listClientFolders(accessToken, referralsFolderId);
    const match = folders.find((f) => f.name.toUpperCase().startsWith(`${CLAIM} `));
    if (!match) {
      throw new Error(`No Drive folder for ${CLAIM}`);
    }
    folderId = match.id;
  }

  const files = await listClientFolderFiles(accessToken, folderId);
  console.log(
    "reparse-bl41649: files:",
    files.map((f) => f.name).join(" | "),
  );

  // Direct debug parse of Addresses/Contacts docx files
  let docxDoctor: string | undefined;
  for (const file of files) {
    const isDocx =
      /word|docx/i.test(file.mimeType) || /\.docx$/i.test(file.name);
    const looksAddresses = /address|contact/i.test(file.name);
    if (!isDocx && !looksAddresses) continue;
    if (!isDocx) continue;

    const buffer = await downloadFileBuffer(accessToken, file);
    const { value: text } = await mammoth.extractRawText({ buffer });
    const parsed = parseContactAddressesDocxText(text);
    console.log(
      `reparse-bl41649: ${file.name} → doctor=${parsed.attendingDoctorName ?? "(none)"} cm=${parsed.claimManagerName ?? "(none)"}`,
    );
    if (parsed.attendingDoctorName) {
      docxDoctor = parsed.attendingDoctorName;
    }
  }

  const { merged: folderSupplement } = await importClientDocumentsFromFolderDetailed(
    accessToken,
    folderId,
  );
  const quality = validateAndRepairClientImport(
    {
      claimNumber: CLAIM,
      clientName: `${client.firstName} ${client.lastName}`,
      diagnoses: [],
      warnings: [],
    },
    folderSupplement,
    { folderClaimNumber: CLAIM },
  );

  const doctorName =
    quality.supplement?.attendingDoctorName?.trim() ||
    folderSupplement?.attendingDoctorName?.trim() ||
    docxDoctor?.trim() ||
    null;

  if (!doctorName) {
    console.error("reparse-bl41649: still could not extract attending doctor name");
    await prisma.portalSetting.upsert({
      where: { key: DONE_KEY },
      create: {
        key: DONE_KEY,
        value: JSON.stringify({ at: new Date().toISOString(), ok: false }),
      },
      update: {
        value: JSON.stringify({ at: new Date().toISOString(), ok: false }),
      },
    });
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      attendingDoctorName: doctorName,
      attendingDoctorAddress:
        quality.supplement?.attendingDoctorAddress ?? folderSupplement?.attendingDoctorAddress,
      attendingDoctorPhone:
        quality.supplement?.attendingDoctorPhone ?? folderSupplement?.attendingDoctorPhone,
      driveFolderId: client.driveFolderId ?? folderId,
    },
  });

  await prisma.portalSetting.upsert({
    where: { key: DONE_KEY },
    create: {
      key: DONE_KEY,
      value: JSON.stringify({
        at: new Date().toISOString(),
        ok: true,
        attendingDoctorName: doctorName,
      }),
    },
    update: {
      value: JSON.stringify({
        at: new Date().toISOString(),
        ok: true,
        attendingDoctorName: doctorName,
      }),
    },
  });

  console.log(`reparse-bl41649: saved attending doctor "${doctorName}"`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("reparse-bl41649 failed:", e);
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
