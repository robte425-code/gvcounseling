import { ClientDriveFiles } from "@/components/portal/ClientDriveFiles";
import { loadClientDriveContents } from "@/lib/client-drive-contents";

export async function ClientDriveFilesSection({
  driveFolderId,
  therapistId,
  initiatorUserId,
  clientId,
  claimNumber,
}: {
  driveFolderId: string | null;
  therapistId?: string | null;
  initiatorUserId?: string;
  clientId?: string;
  claimNumber?: string;
}) {
  const drive = await loadClientDriveContents(driveFolderId, {
    therapistId,
    initiatorUserId,
    clientId,
    claimNumber,
  });
  return <ClientDriveFiles drive={drive} />;
}
