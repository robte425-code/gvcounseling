import type { Edi837Result, IsaUsageIndicator } from "@/lib/edi837";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { resolveEdi837FilesFolderId, uploadDriveFile } from "@/lib/google-drive";

function driveArchiveFilename(edi: Edi837Result): string {
  const base = edi.filename.replace(/\.(txt|edi)$/i, "");
  const usage = edi.usageIndicator === "P" ? "P" : "T";
  return `${base}_${usage}_${edi.isaControl}.TXT`;
}

/** Save a copy of the generated 837 under Drive root "837 Files". */
export async function archiveEdi837ToDrive(options: {
  edi: Edi837Result;
  initiatorUserId?: string;
  usageIndicator?: IsaUsageIndicator;
}): Promise<{ id: string; webViewLink: string; filename: string } | null> {
  try {
    const accessToken = await getDriveAccessTokenForClient({
      initiatorUserId: options.initiatorUserId,
    });
    const folderId = await resolveEdi837FilesFolderId(accessToken);
    const filename = driveArchiveFilename({
      ...options.edi,
      usageIndicator: options.usageIndicator ?? options.edi.usageIndicator,
    });
    const uploaded = await uploadDriveFile(
      accessToken,
      folderId,
      filename,
      Buffer.from(options.edi.content, "utf8"),
      "text/plain",
    );
    return { ...uploaded, filename };
  } catch (error) {
    console.error("Failed to archive 837 file to Google Drive:", error);
    return null;
  }
}
