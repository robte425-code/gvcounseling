import Link from "next/link";
import { getRealUserId, requireAdmin } from "@/auth";
import { GoogleDriveConnectionPanel } from "@/components/portal/GoogleDriveConnectionPanel";
import { portalCardClass } from "@/components/portal/ui";
import {
  DRIVE_FOLDER_AUDIT_LAST_KEY,
  type DriveFolderAuditReport,
} from "@/lib/drive-folder-audit";
import { prisma } from "@/lib/prisma";

function safeDecodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const systemDriveEmail =
  process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL?.trim() || "ghim@gvcounseling.com";

export default async function GoogleDriveIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ driveConnected?: string; driveError?: string }>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const adminUserId = getRealUserId(session);

  let driveConnection: { googleEmail: string | null } | null = null;
  let lastAudit: DriveFolderAuditReport | null = null;
  try {
    driveConnection = await prisma.googleDriveConnection.findUnique({
      where: { userId: adminUserId },
      select: { googleEmail: true },
    });
  } catch (e) {
    console.error("GoogleDriveConnection lookup failed:", e);
  }
  try {
    const auditSetting = await prisma.portalSetting.findUnique({
      where: { key: DRIVE_FOLDER_AUDIT_LAST_KEY },
      select: { value: true },
    });
    if (auditSetting?.value) {
      lastAudit = JSON.parse(auditSetting.value) as DriveFolderAuditReport;
    }
  } catch (e) {
    console.error("Drive folder audit lookup failed:", e);
  }

  const driveMessage =
    params.driveConnected === "1"
      ? `Google Drive connected${driveConnection?.googleEmail ? ` as ${driveConnection.googleEmail}` : ""}.`
      : null;

  const loggedInEmail = session.user.email ?? "";
  const isSystemAccount = loggedInEmail.toLowerCase() === systemDriveEmail.toLowerCase();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/admin/dashboard" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">Google Drive</h1>
        <p className="mt-2 text-muted">
          Connect your admin Google account so the portal and background jobs can read LNI remittance
          PDFs and client folders from Drive.
        </p>
      </div>

      {!isSystemAccount && (
        <div className={`${portalCardClass} border-amber-200 bg-amber-50 text-sm text-amber-950`}>
          You are signed in as <strong>{loggedInEmail}</strong>. Server scripts use{" "}
          <strong>{systemDriveEmail}</strong> — log in as that account before connecting, or update{" "}
          <code className="text-xs">GOOGLE_DRIVE_SYSTEM_USER_EMAIL</code> in your environment.
        </div>
      )}

      <GoogleDriveConnectionPanel
        driveStatus={{
          connected: Boolean(driveConnection),
          googleEmail: driveConnection?.googleEmail,
          message: driveMessage,
          error: params.driveError ? safeDecodeParam(params.driveError) : null,
        }}
        showSync={false}
        description={
          <>
            Click <strong>Connect Google Drive</strong> to sign in with Google and grant access. Use
            this page to reconnect if remittance imports or Drive scripts fail with an authentication
            error. If reconnecting, click <strong>Disconnect</strong> first, then connect again.
          </>
        }
      />

      <div className={`${portalCardClass} space-y-3 text-sm text-muted`}>
        <h2 className="font-serif text-lg font-semibold text-primary-dark">What this connection is used for</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Importing client folders from Maria and Steven Drive directories</li>
          <li>Listing and importing LNI remittance advice PDFs on the Pay page</li>
          <li>Saving a copy of each generated 837 under the Drive root folder “837 Files”</li>
          <li>Server-side scripts that rescan remittances and link invoice attachments</li>
          <li>
            Production builds audit every client’s Drive folder link against live folders under Maria
            / Steven client files (ignoring Trash) and relink mismatches
          </li>
        </ul>
        <p>
          Client import with sync is still available on{" "}
          <Link href="/portal/admin/clients/import" className="text-primary hover:underline">
            Import clients
          </Link>
          .
        </p>
      </div>

      {lastAudit && (
        <div className={`${portalCardClass} space-y-3 text-sm`}>
          <h2 className="font-serif text-lg font-semibold text-primary-dark">
            Last client Drive folder audit
          </h2>
          <p className="text-muted">
            Ran {new Date(lastAudit.ranAt).toLocaleString()} —{" "}
            <span className="text-primary-dark">
              {lastAudit.ok} ok, {lastAudit.relinked} relinked, {lastAudit.issues} issues
            </span>
          </p>
          {lastAudit.errors.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-red-800">
              {lastAudit.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
          {lastAudit.rows.some((r) => r.status !== "ok" && r.status !== "no_live_folder") ? (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto font-mono text-xs">
              {lastAudit.rows
                .filter((r) => r.status !== "ok" && r.status !== "no_live_folder")
                .map((row) => (
                  <li key={`${row.claimNumber}-${row.status}`}>
                    <span className="font-sans font-medium text-primary-dark">{row.status}</span>{" "}
                    {row.claimNumber} ({row.clientName})
                    {row.folderName
                      ? ` → ${row.therapistFolder ?? "?"}/${row.folderName}`
                      : ""}
                    {row.detail ? ` — ${row.detail}` : ""}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-muted">No trash/wrong-folder problems in the last audit.</p>
          )}
        </div>
      )}
    </div>
  );
}
