import Link from "next/link";
import { getRealUserId, requireTherapist } from "@/auth";
import { GoogleDriveConnectionPanel } from "@/components/portal/GoogleDriveConnectionPanel";
import { prisma } from "@/lib/prisma";
import { getTherapistDriveSourceForUser } from "@/lib/therapist-drive";

function safeDecodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function TherapistIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ driveConnected?: string; driveError?: string }>;
}) {
  const session = await requireTherapist();
  const params = await searchParams;
  const userId = getRealUserId(session);

  const [driveConnection, driveSource] = await Promise.all([
    prisma.googleDriveConnection.findUnique({
      where: { userId },
      select: { googleEmail: true },
    }),
    getTherapistDriveSourceForUser(userId),
  ]);

  const driveMessage =
    params.driveConnected === "1"
      ? `Google Drive connected${driveConnection?.googleEmail ? ` as ${driveConnection.googleEmail}` : ""}.`
      : null;

  const folderName = driveSource?.folderName ?? "your client files folder";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/therapist/dashboard" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">Integrations</h1>
        <p className="mt-2 text-muted">
          Connect your Google account to view client files and folders on client pages. Client
          import from Drive is managed by admin.
        </p>
      </div>

      <GoogleDriveConnectionPanel
        showSync={false}
        driveStatus={{
          connected: Boolean(driveConnection),
          googleEmail: driveConnection?.googleEmail,
          message: driveMessage,
          error: params.driveError ? safeDecodeParam(params.driveError) : null,
        }}
        description={
          <>
            Connect with your Google account to browse <strong>{folderName}</strong> from client
            detail pages. Ask an admin to sync or update client records from Drive.
          </>
        }
      />
    </div>
  );
}
