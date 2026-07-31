/**
 * One-shot: re-parse BL41649 Drive docs and save attending doctor name.
 * Safe for production build: never fails the build; only marks done on success.
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

  try {
    if (!force) {
      const done = await prisma.portalSetting.findUnique({
        where: { key: DONE_KEY },
        select: { value: true },
      });
      if (done) {
        console.log("reparse-bl41649: already completed — skipping");
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
      return;
    }

    // Already populated (e.g. manual entry) — mark done so build stops retrying.
    if (client.attendingDoctorName?.trim() && !force) {
      await prisma.portalSetting.upsert({
        where: { key: DONE_KEY },
        create: {
          key: DONE_KEY,
          value: JSON.stringify({
            at: new Date().toISOString(),
            ok: true,
            attendingDoctorName: client.attendingDoctorName.trim(),
            source: "already-on-record",
          }),
        },
        update: {
          value: JSON.stringify({
            at: new Date().toISOString(),
            ok: true,
            attendingDoctorName: client.attendingDoctorName.trim(),
            source: "already-on-record",
          }),
        },
      });
      console.log(
        `reparse-bl41649: doctor already set ("${client.attendingDoctorName.trim()}") — marked done`,
      );
      return;
    }

    console.log(
      `reparse-bl41649: ${client.lastName}, ${client.firstName} doctor=${client.attendingDoctorName ?? "(empty)"} cm=${client.claimManagerName ?? "(empty)"}`,
    );

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
        console.log(`reparse-bl41649: no Drive folder for ${CLAIM} — will retry next deploy`);
        return;
      }
      folderId = match.id;
    }

    const files = await listClientFolderFiles(accessToken, folderId);
    console.log(
      "reparse-bl41649: files:",
      files.map((f) => f.name).join(" | "),
    );

    let docxDoctor: string | undefined;
    for (const file of files) {
      const isDocx = /word|docx/i.test(file.mimeType) || /\.docx$/i.test(file.name);
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
      // Do not mark done — retry on a later deploy after parser/Drive fixes.
      console.log("reparse-bl41649: could not extract attending doctor — will retry next deploy");
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
  } catch (error) {
    // Never fail the production build for this one-shot.
    console.error(
      "reparse-bl41649: non-fatal error —",
      error instanceof Error ? error.message : error,
    );
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  console.error("reparse-bl41649: unexpected error (non-fatal):", e);
});
