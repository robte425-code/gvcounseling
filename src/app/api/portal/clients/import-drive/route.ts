import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRealUserId, requireAdminApi } from "@/auth";
import { resolveOAuthUserIdForTherapist } from "@/lib/google-drive-access";
import {
  importDriveClientFolder,
  scanDriveClientFolders,
  syncClientsFromGoogleDrive,
  type DriveFolderTarget,
} from "@/lib/drive-client-import";

export const maxDuration = 60;

type ImportBody = {
  folderId?: string;
  folderName?: string;
  therapistId?: string;
  therapistName?: string;
};

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const scan = await scanDriveClientFolders(getRealUserId(auth.session));
    return NextResponse.json(scan);
  } catch (e) {
    console.error("Drive scan failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive scan failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const userId = getRealUserId(auth.session);

  try {
    let body: ImportBody = {};
    try {
      body = (await request.json()) as ImportBody;
    } catch {
      body = {};
    }

    if (body.folderId && body.folderName && body.therapistId && body.therapistName) {
      const target: DriveFolderTarget = {
        folderId: body.folderId,
        folderName: body.folderName,
        therapistId: body.therapistId,
        therapistName: body.therapistName,
      };
      const oauthUserId = await resolveOAuthUserIdForTherapist(body.therapistId, userId);
      const result = await importDriveClientFolder(oauthUserId, target);
      revalidatePath("/portal/admin/clients");
      return NextResponse.json(result);
    }

    const result = await syncClientsFromGoogleDrive(userId);
    revalidatePath("/portal/admin/clients");
    revalidatePath("/portal/admin/clients/import");
    return NextResponse.json(result);
  } catch (e) {
    console.error("Drive import failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drive import failed." },
      { status: 500 },
    );
  }
}
