import { ClientAssignmentStatus } from "@/generated/prisma/client";
import type { ClientDocumentSupplement } from "@/lib/client-document-import";
import { parseUploadedReferralDocuments, type UploadedReferralFile } from "@/lib/client-document-import";
import type { ClientDocumentPart } from "@/lib/client-import-quality";
import {
  formatMissingRequiredFields,
  getMissingRequiredImportFields,
  validateAndRepairClientImport,
} from "@/lib/client-import-quality";
import {
  clientFolderName,
  parsedReferralFromForm,
  type ReferralFormPayload,
} from "@/lib/parse-referral-form";
import {
  createDriveFolder,
  resolveNewReferralsFolderId,
  uploadDriveFile,
} from "@/lib/google-drive";
import { getSystemDriveAccessToken } from "@/lib/google-drive-system";
import { mergeParsedReferral, resolveClientName, type ParsedReferral } from "@/lib/referral-parser";
import { prisma } from "@/lib/prisma";

export type ReferralIntakeResult = {
  clientId: string;
  claimNumber: string;
  warnings: string[];
  driveError?: string;
};

const REFERRAL_FILE_FIELDS = [
  "claimStatusFile",
  "addressesFile",
  "bhiApprovalFile",
  "attachment1",
  "attachment2",
  "attachment3",
  "attachment4",
] as const;

export function referralPayloadFromFormData(formData: FormData): ReferralFormPayload {
  return {
    vrcName: String(formData.get("vrcName") ?? "").trim(),
    vrcEmail: String(formData.get("vrcEmail") ?? "").trim(),
    contactMethod: String(formData.get("contactMethod") ?? "").trim() || undefined,
    vrcPhone: String(formData.get("vrcPhone") ?? "").trim() || undefined,
    clientName: String(formData.get("clientName") ?? "").trim(),
    claimNumbers: String(formData.get("claimNumbers") ?? "").trim(),
    clientDob: String(formData.get("clientDob") ?? "").trim() || undefined,
    clientEmail: String(formData.get("clientEmail") ?? "").trim() || undefined,
    pgapCoach: String(formData.get("pgapCoach") ?? "").trim() || undefined,
    languages: String(formData.get("languages") ?? "").trim() || undefined,
    genderIdentity: String(formData.get("genderIdentity") ?? "").trim() || undefined,
    priorServices: String(formData.get("priorServices") ?? "").trim() || undefined,
    clientHistory: String(formData.get("clientHistory") ?? "").trim() || undefined,
  };
}

export async function collectReferralUploads(formData: FormData): Promise<UploadedReferralFile[]> {
  const files: UploadedReferralFile[] = [];
  for (const fieldName of REFERRAL_FILE_FIELDS) {
    const file = formData.get(fieldName);
    if (file instanceof File && file.size > 0) {
      files.push({
        fieldName,
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type || "application/octet-stream",
      });
    }
  }
  return files;
}

async function uploadReferralToDrive(
  claimNumber: string,
  clientName: string,
  uploads: UploadedReferralFile[],
): Promise<{ folderId?: string; error?: string }> {
  try {
    const { accessToken } = await getSystemDriveAccessToken();
    const parentId = await resolveNewReferralsFolderId(accessToken);
    const folderId = await createDriveFolder(
      accessToken,
      clientFolderName(claimNumber, clientName),
      parentId,
    );
    for (const file of uploads) {
      await uploadDriveFile(
        accessToken,
        folderId,
        file.filename,
        file.buffer,
        file.mimeType,
      );
    }
    return { folderId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Drive upload failed." };
  }
}

function buildClientData(
  parsed: ParsedReferral,
  supplement: ClientDocumentSupplement | undefined,
  payload: ReferralFormPayload,
  options: {
    driveFolderId?: string;
    assignmentStatus: ClientAssignmentStatus;
    therapistId?: string | null;
  },
) {
  const claimNumber = parsed.claimNumber!;
  const { firstName, lastName } = resolveClientName(parsed, undefined, null);

  return {
    lniClaimNumber: claimNumber,
    firstName,
    lastName,
    attendingNpi: parsed.attendingNpi ?? null,
    diagnoses: parsed.diagnoses,
    addressLine1: supplement?.addressLine1 ?? null,
    city: supplement?.city ?? null,
    state: supplement?.state ?? "WA",
    zip: supplement?.zip ?? null,
    residenceAddressLine1: supplement?.residenceAddressLine1 ?? null,
    residenceCity: supplement?.residenceCity ?? null,
    residenceState: supplement?.residenceState ?? null,
    residenceZip: supplement?.residenceZip ?? null,
    workerPhone: supplement?.workerPhone ?? null,
    employerName: supplement?.employerName ?? null,
    attendingDoctorName: supplement?.attendingDoctorName ?? null,
    attendingDoctorAddress: supplement?.attendingDoctorAddress ?? null,
    attendingDoctorPhone: supplement?.attendingDoctorPhone ?? null,
    claimManagerName: supplement?.claimManagerName ?? null,
    claimManagerPhone: supplement?.claimManagerPhone ?? null,
    claimManagerFax: supplement?.claimManagerFax ?? null,
    legalRepresentativeName: supplement?.legalRepresentativeName ?? null,
    legalRepresentativeAddress: supplement?.legalRepresentativeAddress ?? null,
    legalRepresentativePhone: supplement?.legalRepresentativePhone ?? null,
    dateOfBirth: parsed.dateOfBirth ?? null,
    gender: parsed.gender ?? null,
    dateOfInjury: parsed.dateOfInjury ?? supplement?.dateOfInjury ?? null,
    vrcName: parsed.vrcName ?? null,
    vrcEmail: parsed.vrcEmail ?? null,
    vrcPhone: parsed.vrcPhone ?? null,
    referralClientEmail: payload.clientEmail ?? null,
    pgapCoach: payload.pgapCoach ?? null,
    languages: payload.languages ?? null,
    priorServices: payload.priorServices ?? null,
    clientHistory: payload.clientHistory ?? parsed.clientHistory ?? null,
    assignmentStatus: options.assignmentStatus,
    driveFolderId: options.driveFolderId ?? null,
    therapistId: options.therapistId ?? null,
    rejectionReason: null,
    rejectedAt: null,
  };
}

export async function processReferralIntake(
  formData: FormData,
  preloadedUploads?: UploadedReferralFile[],
): Promise<ReferralIntakeResult> {
  const payload = referralPayloadFromFormData(formData);
  const parsed = parsedReferralFromForm(payload);
  const warnings: string[] = [];

  if (!parsed.claimNumber) {
    throw new Error("Could not parse a valid L&I claim number from the form.");
  }

  const existing = await prisma.client.findUnique({
    where: { lniClaimNumber: parsed.claimNumber },
  });
  if (existing) {
    throw new Error(`A client with claim number ${parsed.claimNumber} already exists.`);
  }

  const uploads = preloadedUploads ?? (await collectReferralUploads(formData));
  const { merged: supplement, parts, referralFromDocuments } =
    await parseUploadedReferralDocuments(uploads);
  const enrichedParsed = mergeParsedReferral(parsed, referralFromDocuments);

  const quality = validateAndRepairClientImport(enrichedParsed, supplement, {
    folderClaimNumber: parsed.claimNumber,
    folderDisplayName: clientFolderName(parsed.claimNumber, payload.clientName),
    documentParts: parts,
  });

  const repairedReferral = quality.referral;
  const repairedSupplement = quality.supplement;
  warnings.push(...quality.warnings, ...repairedReferral.warnings);

  if (repairedSupplement?.diagnoses.length) {
    const seen = new Set(repairedReferral.diagnoses.map((c) => c.toUpperCase()));
    for (const code of repairedSupplement.diagnoses) {
      const upper = code.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        repairedReferral.diagnoses.push(upper);
      }
    }
  }

  const missing = getMissingRequiredImportFields(repairedReferral, repairedSupplement);
  if (missing.length) {
    warnings.push(`Missing fields (admin may complete): ${formatMissingRequiredFields(missing)}`);
  }

  const drive = await uploadReferralToDrive(parsed.claimNumber, payload.clientName, uploads);
  if (drive.error) {
    warnings.push(`Google Drive: ${drive.error}`);
  }

  const client = await prisma.client.create({
    data: buildClientData(repairedReferral, repairedSupplement, payload, {
      driveFolderId: drive.folderId,
      assignmentStatus: ClientAssignmentStatus.UNASSIGNED,
      therapistId: null,
    }),
  });

  return {
    clientId: client.id,
    claimNumber: client.lniClaimNumber,
    warnings,
    driveError: drive.error,
  };
}

export type ReferralDocumentParts = ClientDocumentPart[];
