import { ClientAssignmentStatus } from "@/generated/prisma/client";
import type { ClientDocumentSupplement } from "@/lib/client-document-import";
import type { ClientDocumentPart } from "@/lib/client-import-quality";
import {
  formatMissingRequiredFields,
  getMissingRequiredImportFields,
  isPlausibleVrcName,
  validateAndRepairClientImport,
} from "@/lib/client-import-quality";
import type { ParsedReferral } from "@/lib/referral-parser";
import { resolveClientName } from "@/lib/referral-parser";
import { isPlausiblePersonName } from "@/lib/parse-lni-cac-fields";
import { prisma } from "@/lib/prisma";

export type ReferralImportResult = {
  created: number;
  updated: number;
  warnings: string[];
  error?: string;
};

export type ReferralImportOptions = {
  /** From Drive folder name: "<claim #> - <client name>" */
  folderDisplayName?: string;
  folderClaimNumber?: string;
  /** Google Drive folder id for incremental sync tracking */
  driveFolderId?: string;
  /** Parsed from CAC / Addresses PDFs in the client folder */
  supplement?: ClientDocumentSupplement;
  /** Per-document parse results for validation and repair */
  documentParts?: ClientDocumentPart[];
  /** Override assignment status for new imports (e.g. CLOSED from archived folders). */
  assignmentStatus?: ClientAssignmentStatus;
  closedAt?: Date | null;
};

function pickClientName(
  referralName?: string,
  supplementName?: string,
  folderDisplayName?: string,
): string | undefined {
  for (const candidate of [referralName, supplementName, folderDisplayName]) {
    const trimmed = candidate?.trim();
    if (trimmed && isPlausiblePersonName(trimmed)) return trimmed;
  }
  return referralName?.trim() || supplementName?.trim() || folderDisplayName?.trim() || undefined;
}

function pickVrcName(referral?: string, supplement?: string): string | undefined {
  const ref = referral?.trim();
  if (ref && isPlausibleVrcName(ref)) return ref;
  const sup = supplement?.trim();
  if (sup && isPlausibleVrcName(sup)) return sup;
  return undefined;
}

export async function upsertClientFromReferral(
  parsed: ParsedReferral,
  therapistId: string,
  options: ReferralImportOptions = {},
): Promise<ReferralImportResult> {
  const quality = validateAndRepairClientImport(parsed, options.supplement, {
    folderClaimNumber: options.folderClaimNumber,
    folderDisplayName: options.folderDisplayName,
    documentParts: options.documentParts,
  });

  const repairedReferral = quality.referral;
  const supplement = quality.supplement;
  const seenWarnings = new Set<string>();
  const warnings: string[] = [];
  for (const w of [...quality.warnings, ...repairedReferral.warnings, ...(supplement?.warnings ?? [])]) {
    if (!seenWarnings.has(w)) {
      seenWarnings.add(w);
      warnings.push(w);
    }
  }

  const claimNumber = repairedReferral.claimNumber ?? supplement?.claimNumber;
  if (!claimNumber) {
    return { created: 0, updated: 0, warnings, error: "Could not parse claim number." };
  }

  const existing = await prisma.client.findUnique({
    where: { lniClaimNumber: claimNumber },
  });

  const mergedReferral: ParsedReferral = {
    ...repairedReferral,
    claimNumber,
    clientName: pickClientName(
      repairedReferral.clientName,
      supplement?.clientName,
      options.folderDisplayName,
    ),
    vrcName: pickVrcName(repairedReferral.vrcName, supplement?.vrcName),
    vrcPhone: repairedReferral.vrcPhone ?? supplement?.vrcPhone,
    dateOfInjury: repairedReferral.dateOfInjury ?? supplement?.dateOfInjury,
    diagnoses: [...repairedReferral.diagnoses],
  };
  if (supplement?.diagnoses.length) {
    const seen = new Set(mergedReferral.diagnoses.map((c) => c.toUpperCase()));
    for (const code of supplement.diagnoses) {
      const upper = code.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        mergedReferral.diagnoses.push(upper);
      }
    }
  }

  const { firstName, lastName } = resolveClientName(
    mergedReferral,
    options.folderDisplayName,
    existing,
  );

  if (firstName === "Unknown" && lastName === "Unknown" && !mergedReferral.clientName?.trim()) {
    warnings.push("Could not find client name");
  }

  const stillMissing = getMissingRequiredImportFields(mergedReferral, supplement);
  if (stillMissing.length) {
    warnings.push(
      `Missing required import fields: ${formatMissingRequiredFields(stillMissing)}`,
    );
  }

  const supplementOrExisting = <T>(value: T | undefined, existing: T | null | undefined): T | null =>
    value !== undefined ? (value ?? null) : (existing ?? null);

  const data = {
    lniClaimNumber: claimNumber,
    firstName,
    lastName,
    attendingNpi: mergedReferral.attendingNpi ?? existing?.attendingNpi ?? null,
    diagnoses: mergedReferral.diagnoses.length
      ? mergedReferral.diagnoses
      : (existing?.diagnoses ?? []),
    addressLine1: supplementOrExisting(supplement?.addressLine1, existing?.addressLine1),
    city: supplementOrExisting(supplement?.city, existing?.city),
    state: supplement?.state ?? existing?.state ?? "WA",
    zip: supplementOrExisting(supplement?.zip, existing?.zip),
    residenceAddressLine1: supplementOrExisting(
      supplement?.residenceAddressLine1,
      existing?.residenceAddressLine1,
    ),
    residenceCity: supplementOrExisting(supplement?.residenceCity, existing?.residenceCity),
    residenceState: supplementOrExisting(supplement?.residenceState, existing?.residenceState),
    residenceZip: supplementOrExisting(supplement?.residenceZip, existing?.residenceZip),
    workerPhone: supplementOrExisting(supplement?.workerPhone, existing?.workerPhone),
    employerName: supplementOrExisting(supplement?.employerName, existing?.employerName),
    attendingDoctorName: supplementOrExisting(
      supplement?.attendingDoctorName,
      existing?.attendingDoctorName,
    ),
    attendingDoctorAddress: supplementOrExisting(
      supplement?.attendingDoctorAddress,
      existing?.attendingDoctorAddress,
    ),
    attendingDoctorPhone: supplementOrExisting(
      supplement?.attendingDoctorPhone,
      existing?.attendingDoctorPhone,
    ),
    claimManagerName: supplementOrExisting(supplement?.claimManagerName, existing?.claimManagerName),
    claimManagerPhone: supplementOrExisting(
      supplement?.claimManagerPhone,
      existing?.claimManagerPhone,
    ),
    claimManagerFax: supplementOrExisting(supplement?.claimManagerFax, existing?.claimManagerFax),
    legalRepresentativeName: supplementOrExisting(
      supplement?.legalRepresentativeName,
      existing?.legalRepresentativeName,
    ),
    legalRepresentativeAddress: supplementOrExisting(
      supplement?.legalRepresentativeAddress,
      existing?.legalRepresentativeAddress,
    ),
    legalRepresentativePhone: supplementOrExisting(
      supplement?.legalRepresentativePhone,
      existing?.legalRepresentativePhone,
    ),
    dateOfBirth: mergedReferral.dateOfBirth ?? existing?.dateOfBirth ?? null,
    gender: mergedReferral.gender ?? existing?.gender ?? null,
    dateOfInjury:
      mergedReferral.dateOfInjury ??
      supplement?.dateOfInjury ??
      existing?.dateOfInjury ??
      null,
    vrcName: mergedReferral.vrcName ?? existing?.vrcName ?? null,
    vrcEmail: mergedReferral.vrcEmail ?? existing?.vrcEmail ?? null,
    vrcPhone: mergedReferral.vrcPhone ?? existing?.vrcPhone ?? null,
    therapistId: existing?.therapistId ?? therapistId,
    assignmentStatus:
      options.assignmentStatus ??
      existing?.assignmentStatus ??
      ClientAssignmentStatus.ACTIVE,
    closedAt:
      options.closedAt !== undefined
        ? options.closedAt
        : existing?.closedAt ?? null,
    driveFolderId: options.driveFolderId ?? existing?.driveFolderId ?? null,
  };

  if (existing) {
    await prisma.client.update({ where: { id: existing.id }, data });
    return { created: 0, updated: 1, warnings };
  }

  await prisma.client.create({ data });
  return { created: 1, updated: 0, warnings };
}
