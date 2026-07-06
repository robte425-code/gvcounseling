import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { driveViewLink } from "@/lib/google-drive";
import { getSystemDriveAccessToken } from "@/lib/google-drive-system";
import {
  listLniRemittanceAdvicePdfs,
  parseRemittanceAdviceFilenameDate,
} from "@/lib/lni-remittance-drive";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { accessToken } = await getSystemDriveAccessToken();
    const files = await listLniRemittanceAdvicePdfs(accessToken);
    const filenames = files.map((file) => file.name);

    const imported = await prisma.remittanceAdvice.findMany({
      where: { sourceFilename: { in: filenames } },
      select: { id: true, sourceFilename: true, status: true, remittanceNumber: true },
    });
    const importedByFilename = new Map(
      imported
        .filter((row) => row.sourceFilename)
        .map((row) => [row.sourceFilename!, row]),
    );

    return NextResponse.json({
      files: files.map((file) => {
        const invoiceDate = parseRemittanceAdviceFilenameDate(file.name);
        const existing = importedByFilename.get(file.name);
        return {
          id: file.id,
          name: file.name,
          webViewLink: file.webViewLink ?? driveViewLink(file.id, file.mimeType),
          invoiceDate: invoiceDate?.toISOString().slice(0, 10) ?? null,
          alreadyImported: Boolean(existing),
          remittanceAdviceId: existing?.id ?? null,
          remittanceNumber: existing?.remittanceNumber ?? null,
          status: existing?.status ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Remittance Drive list failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list LNI RAs folder." },
      { status: 400 },
    );
  }
}
