import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth, getRealRole, getRealUserId, isImpersonating } from "@/auth";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { uploadDriveFile } from "@/lib/google-drive";
import { prisma } from "@/lib/prisma";
import { UploadValidationError, validateUploadedFile } from "@/lib/upload-validation";

/** Admin, or the therapist this client is assigned to. Mirrors the attending-doctor route. */
async function getClientForUpload(clientId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, therapistId: true, driveFolderId: true },
  });
  if (!client) {
    return { error: NextResponse.json({ error: "Client not found." }, { status: 404 }) };
  }

  const role = getRealRole(session);
  const admin = role === "ADMIN" && !isImpersonating(session);
  const therapist =
    session.user.role === "THERAPIST" && client.therapistId === session.user.id;
  if (!admin && !therapist) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { client, session };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const result = await getClientForUpload(id);
    if (result.error) return result.error;
    const { client, session } = result;

    if (!client.driveFolderId) {
      return NextResponse.json(
        { error: "This client has no Google Drive folder yet. Sync the client from Drive first." },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    // Checked before any file is read into memory.
    for (const file of files) {
      validateUploadedFile(file.name, file.type, file.size);
    }

    const accessToken = await getDriveAccessTokenForClient({
      therapistId: client.therapistId,
      initiatorUserId: getRealUserId(session),
    });

    const uploaded: { name: string; webViewLink: string }[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const created = await uploadDriveFile(
        accessToken,
        client.driveFolderId,
        file.name,
        buffer,
        file.type || undefined,
      );
      uploaded.push({ name: file.name, webViewLink: created.webViewLink });
    }

    revalidatePath(`/portal/admin/clients/${id}`);
    revalidatePath(`/portal/therapist/clients/${id}`);

    return NextResponse.json({ uploaded });
  } catch (error) {
    // A rejected file is the caller's mistake, and the message names the rule it broke.
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Client Drive upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 },
    );
  }
}
