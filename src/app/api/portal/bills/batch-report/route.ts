import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { buildEdi837BatchReport } from "@/lib/edi837-batch-report";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const payPeriodId = searchParams.get("payPeriodId")?.trim() ?? "";
    if (!payPeriodId) {
      return NextResponse.json({ error: "payPeriodId is required." }, { status: 400 });
    }

    const report = await buildEdi837BatchReport(payPeriodId);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build 837 batch report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
