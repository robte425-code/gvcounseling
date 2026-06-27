import { ClientDriveFiles } from "@/components/portal/ClientDriveFiles";
import { loadClientDriveContents } from "@/lib/client-drive-contents";

export async function ClientDriveFilesSection({
  driveFolderId,
}: {
  driveFolderId: string | null;
}) {
  const drive = await loadClientDriveContents(driveFolderId);
  return <ClientDriveFiles drive={drive} />;
}
