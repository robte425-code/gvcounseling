import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { buildMelioExportForRemittance, markMelioExported } from "@/lib/melio-export";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const remittanceAdviceId = searchParams.get("remittanceAdviceId")?.trim() ?? "";
    if (!remittanceAdviceId) {
      return NextResponse.json({ error: "remittanceAdviceId is required." }, { status: 400 });
    }

    const mark = searchParams.get("mark") === "1";
    const exportData = await buildMelioExportForRemittance(remittanceAdviceId);
    if (mark) {
      await markMelioExported(exportData.payRunId);
    }

    return new NextResponse(exportData.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportData.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export Melio bills CSV.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
