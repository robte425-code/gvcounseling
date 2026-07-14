import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { buildMelioVendorsExport } from "@/lib/melio-export";

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const exportData = await buildMelioVendorsExport();
    return new NextResponse(exportData.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportData.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export Melio vendors CSV.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
