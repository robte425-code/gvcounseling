import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { isReferralSubmissionFilename, parseClaimNumber } from "@/lib/constants";
import { parseReferralDocx, splitClientName } from "@/lib/referral-parser";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    const therapistId = String(formData.get("therapistId") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!isReferralSubmissionFilename(file.name) && !file.name.toLowerCase().endsWith(".docx")) {
      return NextResponse.json(
        {
          error:
            'Expected a Referral Submission .docx file (filename should contain "Referral" and "Submission").',
        },
        { status: 400 },
      );
    }

    const therapist = await prisma.user.findFirst({
      where: { id: therapistId, role: "THERAPIST" },
    });
    if (!therapist) {
      return NextResponse.json({ error: "Invalid therapist." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseReferralDocx(buffer);
    const warnings = [...parsed.warnings];

    if (!parsed.claimNumber) {
      return NextResponse.json({ error: "Could not parse claim number.", warnings }, { status: 400 });
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
      diagnoses: parsed.diagnoses.length ? parsed.diagnoses : existing?.diagnoses ?? [],
      dateOfBirth: parsed.dateOfBirth ?? existing?.dateOfBirth ?? null,
      gender: parsed.gender ?? existing?.gender ?? null,
      vrcName: parsed.vrcName ?? existing?.vrcName ?? null,
      vrcEmail: parsed.vrcEmail ?? existing?.vrcEmail ?? null,
      vrcPhone: parsed.vrcPhone ?? existing?.vrcPhone ?? null,
      therapistId: existing?.therapistId ?? therapistId,
    };

    if (existing) {
      await prisma.client.update({ where: { id: existing.id }, data });
      return NextResponse.json({ updated: 1, warnings });
    }

    await prisma.client.create({ data });
    return NextResponse.json({ created: 1, warnings });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed." },
      { status: 500 },
    );
  }
}
