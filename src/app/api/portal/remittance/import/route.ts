import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { importRemittancesFromDriveAndUploads } from "@/lib/remittance-import-batch";

function parseDriveFileIds(formData: FormData): string[] {
  const raw = formData.get("driveFileIds");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const files = formData
      .getAll("file")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const driveFileIds = parseDriveFileIds(formData);

    if (!files.length && !driveFileIds.length) {
      return NextResponse.json({ error: "Select at least one remittance PDF." }, { status: 400 });
    }

    const results = await importRemittancesFromDriveAndUploads({
      driveFileIds,
      files,
      importedById: auth.session.user.id,
    });

    revalidatePath("/portal/admin/pay");

    const imported = results.filter((result) => result.status === "imported");
    const failed = results.filter((result) => result.status === "failed");

    if (imported.length === 1 && failed.length === 0) {
      return NextResponse.json({
        remittanceAdviceId: imported[0]!.remittanceAdviceId,
        results,
        imported: imported.length,
        failed: failed.length,
      });
    }

    return NextResponse.json({
      results,
      imported: imported.length,
      failed: failed.length,
      lastRemittanceAdviceId: imported.at(-1)?.remittanceAdviceId ?? null,
    });
  } catch (error) {
    console.error("Remittance import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Remittance import failed." },
      { status: 400 },
    );
  }
}
