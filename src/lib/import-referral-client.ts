import type { ClientDocumentSupplement } from "@/lib/client-document-import";
import type { ParsedReferral } from "@/lib/referral-parser";
import { resolveClientName } from "@/lib/referral-parser";
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
  /** Parsed from CAC / Addresses PDFs in the client folder */
  supplement?: ClientDocumentSupplement;
};

export async function upsertClientFromReferral(
  parsed: ParsedReferral,
  therapistId: string,
  options: ReferralImportOptions = {},
): Promise<ReferralImportResult> {
  const supplement = options.supplement;
  const warnings = [...parsed.warnings, ...(supplement?.warnings ?? [])];

  const claimNumber = parsed.claimNumber ?? supplement?.claimNumber;
  if (!claimNumber) {
    return { created: 0, updated: 0, warnings, error: "Could not parse claim number." };
  }

  const existing = await prisma.client.findUnique({
    where: { lniClaimNumber: claimNumber },
  });

  const mergedReferral: ParsedReferral = {
    ...parsed,
    claimNumber,
    clientName: parsed.clientName ?? supplement?.clientName,
    vrcName: parsed.vrcName ?? supplement?.vrcName,
    vrcPhone: parsed.vrcPhone ?? supplement?.vrcPhone,
    diagnoses: [...parsed.diagnoses],
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

  const data = {
    lniClaimNumber: claimNumber,
    firstName,
    lastName,
    attendingNpi: mergedReferral.attendingNpi ?? existing?.attendingNpi ?? null,
    diagnoses: mergedReferral.diagnoses.length
      ? mergedReferral.diagnoses
      : (existing?.diagnoses ?? []),
    addressLine1: supplement?.addressLine1 ?? existing?.addressLine1 ?? null,
    city: supplement?.city ?? existing?.city ?? null,
    state: supplement?.state ?? existing?.state ?? "WA",
    zip: supplement?.zip ?? existing?.zip ?? null,
    dateOfBirth: mergedReferral.dateOfBirth ?? existing?.dateOfBirth ?? null,
    gender: mergedReferral.gender ?? existing?.gender ?? null,
    dateOfInjury: supplement?.dateOfInjury ?? existing?.dateOfInjury ?? null,
    vrcName: mergedReferral.vrcName ?? existing?.vrcName ?? null,
    vrcEmail: mergedReferral.vrcEmail ?? existing?.vrcEmail ?? null,
    vrcPhone: mergedReferral.vrcPhone ?? existing?.vrcPhone ?? null,
    therapistId: existing?.therapistId ?? therapistId,
  };

  if (existing) {
    await prisma.client.update({ where: { id: existing.id }, data });
    return { created: 0, updated: 1, warnings };
  }

  await prisma.client.create({ data });
  return { created: 1, updated: 0, warnings };
}
