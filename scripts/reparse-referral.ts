/**
 * Re-parse a VRC referral client's Drive folder and update the DB record.
 * Usage: npx tsx scripts/reparse-referral.ts BM27353 [--dry-run]
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const claimNumber = process.argv[2]?.trim().toUpperCase();
  const dryRun = process.argv.includes("--dry-run");
  const debug = process.argv.includes("--debug");

  if (!claimNumber) {
    console.error("Usage: npx tsx scripts/reparse-referral.ts <CLAIM> [--dry-run]");
    process.exit(1);
  }

  const {
    downloadFileBuffer,
    downloadReferralDocx,
    findReferralSubmissionFile,
    listClientFolderFiles,
    listClientFolders,
    resolveNewReferralsFolderId,
  } = await import("../src/lib/google-drive");
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const clientDocImport = await import("../src/lib/client-document-import");
  const {
    importClientDocumentsFromFolderDetailed,
    parseUploadedReferralDocuments,
  } = clientDocImport;
  type UploadedReferralFile = import("../src/lib/client-document-import").UploadedReferralFile;
  const {
    formatMissingRequiredFields,
    getMissingRequiredImportFields,
    validateAndRepairClientImport,
  } = await import("../src/lib/client-import-quality");
  const referralParser = await import("../src/lib/referral-parser");
  const { mergeParsedReferral, parseReferralDocx, resolveClientName } = referralParser;
  type ParsedReferral = import("../src/lib/referral-parser").ParsedReferral;
  const { prisma } = await import("../src/lib/prisma");

  async function findReferralFolder(
    accessToken: string,
    claim: string,
    driveFolderId?: string | null,
  ): Promise<{ folderId: string; folderName: string }> {
    if (driveFolderId) {
      return { folderId: driveFolderId, folderName: `${claim} (stored folder)` };
    }

    const referralsFolderId = await resolveNewReferralsFolderId(accessToken);
    const folders = await listClientFolders(accessToken, referralsFolderId);
    const match = folders.find((f) => f.name.toUpperCase().startsWith(`${claim} `));
    if (!match) {
      throw new Error(`No Drive folder found for claim ${claim} in New Referrals.`);
    }
    return { folderId: match.id, folderName: match.name };
  }

  const client = await prisma.client.findUnique({ where: { lniClaimNumber: claimNumber } });
  if (!client) {
    throw new Error(`Client not found for claim ${claimNumber}.`);
  }

  const { accessToken } = await getSystemDriveAccessToken();
  const folder = await findReferralFolder(accessToken, claimNumber, client.driveFolderId);

  console.log("Client:", `${client.firstName} ${client.lastName}`, `(${client.lniClaimNumber})`);
  console.log("Folder:", folder.folderName, folder.folderId);
  console.log("Assignment:", client.assignmentStatus, "Therapist:", client.therapistId ?? "none");

  const existingReferral: ParsedReferral = {
    vrcName: client.vrcName ?? undefined,
    vrcEmail: client.vrcEmail ?? undefined,
    vrcPhone: client.vrcPhone ?? undefined,
    clientName: `${client.firstName} ${client.lastName}`.trim(),
    claimNumber: client.lniClaimNumber,
    dateOfBirth: client.dateOfBirth ?? undefined,
    dateOfInjury: client.dateOfInjury ?? undefined,
    clientEmail: client.referralClientEmail ?? undefined,
    gender: client.gender ?? undefined,
    attendingNpi: client.attendingNpi ?? undefined,
    diagnoses: [...client.diagnoses],
    clientHistory: client.clientHistory ?? undefined,
    warnings: [],
  };

  const files = await listClientFolderFiles(accessToken, folder.folderId);
  console.log("\nFiles in folder:");
  for (const file of files) console.log(`  ${file.name} (${file.mimeType})`);

  if (debug) {
    const mammoth = (await import("mammoth")).default;
    const { extractPdfText } = await import("../src/lib/pdf-text");
    for (const file of files) {
      const buffer = await downloadFileBuffer(accessToken, file);
      let text = "";
      if (/word|docx/i.test(file.mimeType) || file.name.endsWith(".docx")) {
        text = (await mammoth.extractRawText({ buffer })).value;
      } else {
        text = (await extractPdfText(buffer)).text;
      }
      console.log(`\n--- ${file.name} (${text.length} chars) ---\n${text.slice(0, 5000)}`);
    }
  }

  const uploads: UploadedReferralFile[] = [];
  for (const file of files) {
    const buffer = await downloadFileBuffer(accessToken, file);
    let fieldName = "attachment1";
    const lower = file.name.toLowerCase();
    if (/claim|status|cac|account center/i.test(lower)) fieldName = "claimStatusFile";
    else if (/address|contact|fax/i.test(lower)) fieldName = "addressesFile";
    else if (/bhi|approval/i.test(lower)) fieldName = "bhiApprovalFile";

    uploads.push({
      fieldName,
      filename: file.name,
      buffer,
      mimeType: file.mimeType,
    });
  }

  const { merged: uploadSupplement, parts, referralFromDocuments } =
    await parseUploadedReferralDocuments(uploads);

  let referral = mergeParsedReferral(existingReferral, referralFromDocuments);

  const referralFile = await findReferralSubmissionFile(accessToken, folder.folderId);
  if (referralFile) {
    console.log("\nReferral submission file:", referralFile.name);
    try {
      const parsed = await parseReferralDocx(await downloadReferralDocx(accessToken, referralFile));
      referral = mergeParsedReferral(referral, parsed);
    } catch (e) {
      console.log("Referral docx parse error:", e instanceof Error ? e.message : e);
    }
  }

  const { merged: folderSupplement, parts: folderParts } =
    await importClientDocumentsFromFolderDetailed(accessToken, folder.folderId);

  const combinedParts = [
    ...parts,
    ...folderParts.filter((p) => !parts.some((x) => x.filename === p.filename)),
  ];
  const quality = validateAndRepairClientImport(referral, folderSupplement, {
    documentParts: combinedParts,
    folderClaimNumber: referral.claimNumber,
  });

  const repairedReferral = quality.referral;
  const supplement = quality.supplement ?? uploadSupplement ?? folderSupplement;
  const { firstName, lastName } = resolveClientName(repairedReferral, folder.folderName, client);
  const missing = getMissingRequiredImportFields(repairedReferral, supplement);

  const updateData = {
    firstName,
    lastName,
    attendingNpi: repairedReferral.attendingNpi ?? client.attendingNpi,
    diagnoses: repairedReferral.diagnoses.length ? repairedReferral.diagnoses : client.diagnoses,
    addressLine1: supplement?.addressLine1 ?? client.addressLine1,
    city: supplement?.city ?? client.city,
    state: supplement?.state ?? client.state,
    zip: supplement?.zip ?? client.zip,
    residenceAddressLine1: supplement?.residenceAddressLine1 ?? client.residenceAddressLine1,
    residenceCity: supplement?.residenceCity ?? client.residenceCity,
    residenceState: supplement?.residenceState ?? client.residenceState,
    residenceZip: supplement?.residenceZip ?? client.residenceZip,
    workerPhone: supplement?.workerPhone ?? client.workerPhone,
    employerName: supplement?.employerName ?? client.employerName,
    attendingDoctorName: supplement?.attendingDoctorName ?? client.attendingDoctorName,
    attendingDoctorAddress: supplement?.attendingDoctorAddress ?? client.attendingDoctorAddress,
    attendingDoctorPhone: supplement?.attendingDoctorPhone ?? client.attendingDoctorPhone,
    claimManagerName: supplement?.claimManagerName ?? client.claimManagerName,
    claimManagerPhone: supplement?.claimManagerPhone ?? client.claimManagerPhone,
    claimManagerFax: supplement?.claimManagerFax ?? client.claimManagerFax,
    legalRepresentativeName: supplement?.legalRepresentativeName ?? client.legalRepresentativeName,
    legalRepresentativeAddress:
      supplement?.legalRepresentativeAddress ?? client.legalRepresentativeAddress,
    legalRepresentativePhone:
      supplement?.legalRepresentativePhone ?? client.legalRepresentativePhone,
    dateOfBirth: repairedReferral.dateOfBirth ?? client.dateOfBirth,
    gender: repairedReferral.gender ?? client.gender,
    dateOfInjury: repairedReferral.dateOfInjury ?? supplement?.dateOfInjury ?? client.dateOfInjury,
    vrcName: repairedReferral.vrcName ?? client.vrcName,
    vrcPhone: repairedReferral.vrcPhone ?? client.vrcPhone,
    driveFolderId: client.driveFolderId ?? folder.folderId,
  };

  console.log("\nMerged supplement:", JSON.stringify(supplement, null, 2));

  console.log("\nBefore → After (key fields):");
  const compare = (
    label: string,
    before: string | null | undefined,
    after: string | null | undefined,
  ) => {
    const b = before?.trim() || "(empty)";
    const a = after?.trim() || "(empty)";
    if (b !== a) console.log(`  ${label}: ${b} → ${a}`);
  };
  compare("Employer", client.employerName, updateData.employerName);
  compare("Doctor", client.attendingDoctorName, updateData.attendingDoctorName);
  compare("Claim mgr", client.claimManagerName, updateData.claimManagerName);
  compare("Mailing", client.addressLine1, updateData.addressLine1);
  compare("City/zip", [client.city, client.zip].filter(Boolean).join(" "), [updateData.city, updateData.zip].filter(Boolean).join(" "));
  compare("Residence", client.residenceAddressLine1, updateData.residenceAddressLine1);
  compare("DOI", client.dateOfInjury?.toISOString().slice(0, 10), updateData.dateOfInjury?.toISOString().slice(0, 10));
  compare("VRC", client.vrcName, updateData.vrcName);

  console.log("\nDocument parts:", combinedParts.length);
  for (const part of combinedParts) {
    for (const w of part.supplement.warnings) {
      console.log(`  ${part.filename}: ${w}`);
    }
  }

  if (missing.length) {
    console.log("\nStill missing:", formatMissingRequiredFields(missing));
  } else {
    console.log("\nAll required import fields present.");
  }

  if (dryRun) {
    console.log("\nDry run — no database changes.");
    await prisma.$disconnect();
    return;
  }

  await prisma.client.update({
    where: { id: client.id },
    data: updateData,
  });

  console.log("\nUpdated client record for", claimNumber);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
