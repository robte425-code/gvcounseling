import type { ParsedReferral } from "@/lib/referral-parser";
import { splitClientName } from "@/lib/referral-parser";
import { prisma } from "@/lib/prisma";

export type ReferralImportResult = {
  created: number;
  updated: number;
  warnings: string[];
  error?: string;
};

export async function upsertClientFromReferral(
  parsed: ParsedReferral,
  therapistId: string,
): Promise<ReferralImportResult> {
  const warnings = [...parsed.warnings];

  if (!parsed.claimNumber) {
    return { created: 0, updated: 0, warnings, error: "Could not parse claim number." };
  }

  const nameParts = splitClientName(parsed.clientName);
  const existing = await prisma.client.findUnique({
    where: { lniClaimNumber: parsed.claimNumber },
  });

  const data = {
    lniClaimNumber: parsed.claimNumber,
    firstName: nameParts?.firstName ?? existing?.firstName ?? "Unknown",
    lastName: nameParts?.lastName ?? existing?.lastName ?? "Unknown",
    attendingNpi: parsed.attendingNpi ?? existing?.attendingNpi ?? null,
    diagnoses: parsed.diagnoses.length ? parsed.diagnoses : (existing?.diagnoses ?? []),
    dateOfBirth: parsed.dateOfBirth ?? existing?.dateOfBirth ?? null,
    gender: parsed.gender ?? existing?.gender ?? null,
    vrcName: parsed.vrcName ?? existing?.vrcName ?? null,
    vrcEmail: parsed.vrcEmail ?? existing?.vrcEmail ?? null,
    vrcPhone: parsed.vrcPhone ?? existing?.vrcPhone ?? null,
    therapistId: existing?.therapistId ?? therapistId,
  };

  if (existing) {
    await prisma.client.update({ where: { id: existing.id }, data });
    return { created: 0, updated: 1, warnings };
  }

  await prisma.client.create({ data });
  return { created: 1, updated: 0, warnings };
}
