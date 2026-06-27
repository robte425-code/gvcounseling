import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRealUserId, requireAdminApi } from "@/auth";
import { resyncClientFromDrive } from "@/lib/drive-client-import";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const userId = getRealUserId(auth.session);

  try {
    const result = await resyncClientFromDrive(userId, id);
    revalidatePath("/portal/admin/clients");
    revalidatePath(`/portal/admin/clients/${id}`);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Client Drive resync failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive resync failed." },
      { status: 500 },
    );
  }
}
