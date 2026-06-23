import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { importClientsFromGoogleDrive } from "@/lib/drive-client-import";

export async function POST() {
  try {
    const session = await requireAdmin();
    const result = await importClientsFromGoogleDrive(session.user.id);

    revalidatePath("/portal/admin/clients");
    revalidatePath("/portal/admin/clients/import");

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive import failed." },
      { status: 500 },
    );
  }
}
