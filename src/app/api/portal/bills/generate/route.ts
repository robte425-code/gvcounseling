import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { generate837ForPayPeriod } from "@/lib/generate-837-for-pay-period";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const payPeriodId = searchParams.get("payPeriodId")?.trim() ?? "";
    if (!payPeriodId) {
      return NextResponse.json({ error: "payPeriodId is required." }, { status: 400 });
    }

    const edi = await generate837ForPayPeriod(payPeriodId);

    return new NextResponse(edi.content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${edi.filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate 837 file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
