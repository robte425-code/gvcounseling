import { ClientDriveFiles } from "@/components/portal/ClientDriveFiles";
import { loadClientDriveContents } from "@/lib/client-drive-contents";

export async function ClientDriveFilesSection({
  driveFolderId,
  therapistId,
  initiatorUserId,
}: {
  driveFolderId: string | null;
  therapistId?: string | null;
  initiatorUserId?: string;
}) {
  const drive = await loadClientDriveContents(driveFolderId, { therapistId, initiatorUserId });
  return <ClientDriveFiles drive={drive} />;
}
