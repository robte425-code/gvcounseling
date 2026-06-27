import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRealUserId, requirePortalDriveApi } from "@/auth";
import { resolveOAuthUserIdForTherapist } from "@/lib/google-drive-access";
import { resyncClientFromDrive } from "@/lib/drive-client-import";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requirePortalDriveApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const userId = getRealUserId(auth.session);

  if (auth.role === "THERAPIST") {
    const client = await prisma.client.findFirst({
      where: { id, therapistId: userId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
  }

  try {
    const result = await resyncClientFromDrive(userId, id);
    revalidatePath("/portal/admin/clients");
    revalidatePath(`/portal/admin/clients/${id}`);
    revalidatePath("/portal/therapist/clients");
    revalidatePath(`/portal/therapist/clients/${id}`);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Client Drive resync failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive resync failed." },
      { status: 500 },
    );
  }
}
