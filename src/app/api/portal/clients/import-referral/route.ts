import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { upsertClientFromReferral } from "@/lib/import-referral-client";
import { isReferralSubmissionFilename } from "@/lib/constants";
import { parseReferralDocx } from "@/lib/referral-parser";
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
      where: { id: therapistId, role: "THERAPIST", active: true },
    });
    if (!therapist) {
      return NextResponse.json({ error: "Invalid or inactive therapist." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseReferralDocx(buffer);
    const result = await upsertClientFromReferral(parsed, therapistId);

    if (result.error) {
      return NextResponse.json({ error: result.error, warnings: result.warnings }, { status: 400 });
    }

    revalidatePath("/portal/admin/clients");

    return NextResponse.json({
      created: result.created,
      updated: result.updated,
      warnings: result.warnings,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed." },
      { status: 500 },
    );
  }
}
