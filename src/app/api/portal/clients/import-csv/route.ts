import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { parseClaimNumber } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    const defaultTherapistId = String(formData.get("therapistId") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const claim = parseClaimNumber(row.claim_number ?? row.claim ?? "");
      if (!claim) {
        errors.push("Skipped row with missing claim number");
        continue;
      }

      let therapistId = defaultTherapistId;
      const therapistEmail = row.therapist_email?.toLowerCase();
      if (therapistEmail) {
        const therapist = await prisma.user.findUnique({ where: { email: therapistEmail } });
        if (therapist) therapistId = therapist.id;
      }

      const existing = await prisma.client.findUnique({ where: { lniClaimNumber: claim } });
      const data = {
        lniClaimNumber: claim,
        firstName: row.first_name || existing?.firstName || "Unknown",
        lastName: row.last_name || existing?.lastName || "Unknown",
        vrcName: row.vrc_name || existing?.vrcName || null,
        therapistId: existing?.therapistId ?? therapistId,
        diagnoses: existing?.diagnoses ?? [],
      };

      if (existing) {
        await prisma.client.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.client.create({ data });
        created++;
      }
    }

    return NextResponse.json({ created, updated, errors });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed." },
      { status: 500 },
    );
  }
}
