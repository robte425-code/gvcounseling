import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { importRemittanceFromUpload } from "@/lib/remittance-advice";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Remittance PDF is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { remittanceAdviceId } = await importRemittanceFromUpload({
      buffer,
      sourceFilename: file.name,
      importedById: auth.session.user.id,
    });

    revalidatePath("/portal/admin/pay");

    return NextResponse.json({ remittanceAdviceId });
  } catch (error) {
    console.error("Remittance import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Remittance import failed." },
      { status: 400 },
    );
  }
}
