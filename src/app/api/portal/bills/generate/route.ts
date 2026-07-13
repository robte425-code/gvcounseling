import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { parseIsaUsageIndicatorParam } from "@/lib/edi837";
import { generate837ForPayPeriod } from "@/lib/generate-837-for-pay-period";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const payPeriodId = searchParams.get("payPeriodId")?.trim() ?? "";
    if (!payPeriodId) {
      return NextResponse.json({ error: "payPeriodId is required." }, { status: 400 });
    }

    const usageIndicator = parseIsaUsageIndicatorParam(searchParams.get("usageIndicator"));
    const edi = await generate837ForPayPeriod(payPeriodId, {
      usageIndicator,
      generatedById: auth.session.user.id,
    });

    return new NextResponse(edi.content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${edi.filename}"`,
        "X-Edi-Isa-Control": edi.isaControl,
        "X-Edi-Gs-Control": edi.gsControl,
        "X-Edi-Claim-Count": String(edi.claimCount),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate 837 file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
