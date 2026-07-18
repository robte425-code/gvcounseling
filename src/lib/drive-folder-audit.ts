import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { findDriveFolderForClaim } from "@/lib/drive-folder-match";
import {
  getDriveFileMeta,
  parseClientFolderName,
} from "@/lib/google-drive";
import {
  scanDriveClientFolders,
  type DriveFolderTarget,
} from "@/lib/drive-client-import";
import { prisma } from "@/lib/prisma";

export const DRIVE_FOLDER_AUDIT_LAST_KEY = "drive_folder_audit_last";

export type DriveFolderAuditStatus =
  | "ok"
  | "relinked_from_trash"
  | "relinked_wrong_folder"
  | "relinked_missing_link"
  | "trash_no_live_folder"
  | "wrong_folder_no_live"
  | "no_live_folder"
  | "error";

export type DriveFolderAuditRow = {
  claimNumber: string;
  clientName: string;
  status: DriveFolderAuditStatus;
  previousFolderId: string | null;
  previousFolderName: string | null;
  folderId: string | null;
  folderName: string | null;
  therapistFolder: string | null;
  detail?: string;
};

export type DriveFolderAuditReport = {
  ranAt: string;
  ok: number;
  relinked: number;
  issues: number;
  errors: string[];
  rows: DriveFolderAuditRow[];
};

export type DriveFolderAuditOptions = {
  initiatorUserId: string;
  /** When false, only report — do not update driveFolderId. Default true. */
  fix?: boolean;
  claimNumbers?: string[];
};

function clientLabel(firstName: string, lastName: string): string {
  return `${lastName}, ${firstName}`;
}

export async function auditAndRelinkClientDriveFolders(
  options: DriveFolderAuditOptions,
): Promise<DriveFolderAuditReport> {
  const fix = options.fix !== false;
  const errors: string[] = [];
  const rows: DriveFolderAuditRow[] = [];

  const { folders, errors: scanErrors } = await scanDriveClientFolders(
    options.initiatorUserId,
    { includeClosedCases: true },
  );
  errors.push(...scanErrors);

  const liveById = new Map(folders.map((f) => [f.folderId, f]));
  const liveByClaim = new Map<string, DriveFolderTarget>();
  for (const folder of folders) {
    const parsed = parseClientFolderName(folder.folderName);
    if (!parsed) continue;
    const existing = liveByClaim.get(parsed.claimNumber);
    if (!existing || (existing.fromClosedCases && !folder.fromClosedCases)) {
      liveByClaim.set(parsed.claimNumber, folder);
    }
  }

  const clients = await prisma.client.findMany({
    where: options.claimNumbers?.length
      ? { lniClaimNumber: { in: options.claimNumbers.map((c) => c.toUpperCase()) } }
      : undefined,
    select: {
      id: true,
      lniClaimNumber: true,
      firstName: true,
      lastName: true,
      driveFolderId: true,
      therapistId: true,
      assignmentStatus: true,
    },
    orderBy: { lniClaimNumber: "asc" },
  });

  let accessToken: string | null = null;
  const getToken = async (therapistId: string | null) => {
    if (accessToken) return accessToken;
    accessToken = await getDriveAccessTokenForClient({
      therapistId,
      initiatorUserId: options.initiatorUserId,
    });
    return accessToken;
  };

  for (const client of clients) {
    const claim = client.lniClaimNumber;
    const name = clientLabel(client.firstName, client.lastName);
    const expected = liveByClaim.get(claim) ?? findDriveFolderForClaim(folders, claim, null);
    const previousFolderId = client.driveFolderId;

    try {
      if (previousFolderId && liveById.has(previousFolderId)) {
        const stored = liveById.get(previousFolderId)!;
        const storedClaim = parseClientFolderName(stored.folderName)?.claimNumber;
        if (storedClaim === claim) {
          if (expected && expected.folderId !== previousFolderId && !expected.fromClosedCases) {
            // Prefer active therapist-tree folder over a closed-cases duplicate.
            if (fix) {
              await prisma.client.update({
                where: { id: client.id },
                data: { driveFolderId: expected.folderId },
              });
            }
            rows.push({
              claimNumber: claim,
              clientName: name,
              status: "relinked_wrong_folder",
              previousFolderId,
              previousFolderName: stored.folderName,
              folderId: expected.folderId,
              folderName: expected.folderName,
              therapistFolder: expected.therapistName,
              detail: "Preferred live folder over closed/other match.",
            });
            continue;
          }
          rows.push({
            claimNumber: claim,
            clientName: name,
            status: "ok",
            previousFolderId,
            previousFolderName: stored.folderName,
            folderId: previousFolderId,
            folderName: stored.folderName,
            therapistFolder: stored.therapistName,
          });
          continue;
        }

        if (expected && fix) {
          await prisma.client.update({
            where: { id: client.id },
            data: { driveFolderId: expected.folderId },
          });
          rows.push({
            claimNumber: claim,
            clientName: name,
            status: "relinked_wrong_folder",
            previousFolderId,
            previousFolderName: stored.folderName,
            folderId: expected.folderId,
            folderName: expected.folderName,
            therapistFolder: expected.therapistName,
            detail: `Stored folder belonged to claim ${storedClaim ?? "unknown"}.`,
          });
          continue;
        }

        rows.push({
          claimNumber: claim,
          clientName: name,
          status: "wrong_folder_no_live",
          previousFolderId,
          previousFolderName: stored.folderName,
          folderId: previousFolderId,
          folderName: stored.folderName,
          therapistFolder: stored.therapistName,
          detail: `Stored folder belonged to claim ${storedClaim ?? "unknown"}; no live folder for ${claim}.`,
        });
        continue;
      }

      if (previousFolderId) {
        let previousFolderName: string | null = null;
        let trashed = false;
        try {
          const meta = await getDriveFileMeta(await getToken(client.therapistId), previousFolderId);
          previousFolderName = meta.name;
          trashed = meta.trashed;
        } catch (e) {
          previousFolderName = "(unreadable)";
          rows.push({
            claimNumber: claim,
            clientName: name,
            status: expected ? (fix ? "relinked_wrong_folder" : "wrong_folder_no_live") : "error",
            previousFolderId,
            previousFolderName,
            folderId: expected && fix ? expected.folderId : previousFolderId,
            folderName: expected && fix ? expected.folderName : null,
            therapistFolder: expected?.therapistName ?? null,
            detail: e instanceof Error ? e.message : "Could not read stored folder.",
          });
          if (expected && fix) {
            await prisma.client.update({
              where: { id: client.id },
              data: { driveFolderId: expected.folderId },
            });
          }
          continue;
        }

        if (trashed || parseClientFolderName(previousFolderName)?.claimNumber !== claim) {
          if (expected && fix) {
            await prisma.client.update({
              where: { id: client.id },
              data: { driveFolderId: expected.folderId },
            });
            rows.push({
              claimNumber: claim,
              clientName: name,
              status: trashed ? "relinked_from_trash" : "relinked_wrong_folder",
              previousFolderId,
              previousFolderName,
              folderId: expected.folderId,
              folderName: expected.folderName,
              therapistFolder: expected.therapistName,
              detail: trashed
                ? "Stored folder was in Trash."
                : "Stored folder name did not match claim.",
            });
            continue;
          }
          rows.push({
            claimNumber: claim,
            clientName: name,
            status: trashed ? "trash_no_live_folder" : "wrong_folder_no_live",
            previousFolderId,
            previousFolderName,
            folderId: previousFolderId,
            folderName: previousFolderName,
            therapistFolder: null,
            detail: trashed
              ? "Stored folder is in Trash; no live folder under therapist client files."
              : "Stored folder is outside therapist trees; no live claim folder found.",
          });
          continue;
        }

        // Name matches claim but folder is not under Maria/Steven scan (unexpected).
        if (expected && expected.folderId !== previousFolderId && fix) {
          await prisma.client.update({
            where: { id: client.id },
            data: { driveFolderId: expected.folderId },
          });
          rows.push({
            claimNumber: claim,
            clientName: name,
            status: "relinked_wrong_folder",
            previousFolderId,
            previousFolderName,
            folderId: expected.folderId,
            folderName: expected.folderName,
            therapistFolder: expected.therapistName,
            detail: "Stored folder was not under therapist client files; linked live folder.",
          });
          continue;
        }

        rows.push({
          claimNumber: claim,
          clientName: name,
          status: "ok",
          previousFolderId,
          previousFolderName,
          folderId: previousFolderId,
          folderName: previousFolderName,
          therapistFolder: expected?.therapistName ?? null,
          detail: "Folder name matches claim but was not in the therapist-tree scan.",
        });
        continue;
      }

      // No stored folder id
      if (expected) {
        if (fix) {
          await prisma.client.update({
            where: { id: client.id },
            data: { driveFolderId: expected.folderId },
          });
          rows.push({
            claimNumber: claim,
            clientName: name,
            status: "relinked_missing_link",
            previousFolderId: null,
            previousFolderName: null,
            folderId: expected.folderId,
            folderName: expected.folderName,
            therapistFolder: expected.therapistName,
          });
        } else {
          rows.push({
            claimNumber: claim,
            clientName: name,
            status: "no_live_folder",
            previousFolderId: null,
            previousFolderName: null,
            folderId: expected.folderId,
            folderName: expected.folderName,
            therapistFolder: expected.therapistName,
            detail: "Live folder exists but client has no driveFolderId (dry run).",
          });
        }
        continue;
      }

      rows.push({
        claimNumber: claim,
        clientName: name,
        status: "no_live_folder",
        previousFolderId: null,
        previousFolderName: null,
        folderId: null,
        folderName: null,
        therapistFolder: null,
        detail: "No live Drive folder under therapist client files.",
      });
    } catch (e) {
      rows.push({
        claimNumber: claim,
        clientName: name,
        status: "error",
        previousFolderId,
        previousFolderName: null,
        folderId: previousFolderId,
        folderName: null,
        therapistFolder: null,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const relinked = rows.filter((r) => r.status.startsWith("relinked_")).length;
  const ok = rows.filter((r) => r.status === "ok").length;
  const issues = rows.length - ok - relinked;

  const report: DriveFolderAuditReport = {
    ranAt: new Date().toISOString(),
    ok,
    relinked,
    issues,
    errors,
    rows,
  };

  await prisma.portalSetting.upsert({
    where: { key: DRIVE_FOLDER_AUDIT_LAST_KEY },
    create: { key: DRIVE_FOLDER_AUDIT_LAST_KEY, value: JSON.stringify(report) },
    update: { value: JSON.stringify(report) },
  });

  return report;
}

export function formatDriveFolderAuditReport(report: DriveFolderAuditReport): string {
  const lines = [
    `Drive folder audit ${report.ranAt}`,
    `ok=${report.ok} relinked=${report.relinked} issues=${report.issues}`,
    ...(report.errors.length ? [`scan errors:`, ...report.errors.map((e) => `  - ${e}`)] : []),
    "",
  ];

  const interesting = report.rows.filter((r) => r.status !== "ok" && r.status !== "no_live_folder");
  const noFolder = report.rows.filter((r) => r.status === "no_live_folder");

  if (interesting.length) {
    lines.push("Problems / relinks:");
    for (const row of interesting) {
      lines.push(
        `  ${row.status} ${row.claimNumber} (${row.clientName})` +
          (row.folderName ? ` → ${row.therapistFolder ?? "?"}/${row.folderName}` : "") +
          (row.detail ? ` — ${row.detail}` : ""),
      );
    }
    lines.push("");
  }

  if (noFolder.length) {
    lines.push(`Clients with no live Drive folder (${noFolder.length}):`);
    for (const row of noFolder) {
      lines.push(`  ${row.claimNumber} (${row.clientName})`);
    }
    lines.push("");
  }

  lines.push(`All OK clients: ${report.ok}`);
  return lines.join("\n");
}
