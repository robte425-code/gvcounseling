import { NextResponse } from "next/server";
import { auth, getRealRole, getRealUserId, isImpersonating } from "@/auth";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { createResumableUploadSession } from "@/lib/google-drive";
import { prisma } from "@/lib/prisma";
import {
  DIRECT_UPLOAD_MAX_FILE_BYTES,
  UploadValidationError,
  directUploadMaxMb,
  validateUploadedFile,
} from "@/lib/upload-validation";

/**
 * Mints a Google resumable-upload URL for one file, so the browser can send the
 * bytes straight to Drive.
 *
 * Posting a file to a route handler is capped at roughly 4.5 MB by the platform,
 * which rejects it before any handler runs — too small for a scanned document.
 * Name, type, and destination folder are decided here, so the URL only permits
 * creating that one file in that one client's folder.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, therapistId: true, driveFolderId: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    const role = getRealRole(session);
    const admin = role === "ADMIN" && !isImpersonating(session);
    const therapist =
      session.user.role === "THERAPIST" && client.therapistId === session.user.id;
    if (!admin && !therapist) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (!client.driveFolderId) {
      return NextResponse.json(
        { error: "This client has no Google Drive folder yet. Sync the client from Drive first." },
        { status: 400 },
      );
    }

    const { filename, contentType, size } = (await request.json()) as {
      filename?: string;
      contentType?: string;
      size?: number;
    };
    if (!filename || typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "File name and size are required." }, { status: 400 });
    }

    validateUploadedFile(filename, contentType ?? "", size);
    if (size > DIRECT_UPLOAD_MAX_FILE_BYTES) {
      throw new UploadValidationError(
        `${filename} is too large. Each file must be ${directUploadMaxMb()} MB or smaller.`,
      );
    }

    const accessToken = await getDriveAccessTokenForClient({
      therapistId: client.therapistId,
      initiatorUserId: getRealUserId(session),
    });

    const uploadUrl = await createResumableUploadSession(
      accessToken,
      client.driveFolderId,
      filename,
      contentType ?? "",
      size,
    );

    return NextResponse.json({ uploadUrl });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Drive upload session failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the upload." },
      { status: 500 },
    );
  }
}
