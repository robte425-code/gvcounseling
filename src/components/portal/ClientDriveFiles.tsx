import {
  portalCardCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import type { DriveItemLink } from "@/lib/google-drive";
import type { ClientDriveContentsResult } from "@/lib/client-drive-contents";

function DriveItemRow({ item }: { item: DriveItemLink }) {
  return (
    <li
      className="flex items-baseline gap-2 text-sm"
      style={{ paddingLeft: `${item.depth * 1.25}rem` }}
    >
      <span className="shrink-0 text-xs text-muted">{item.isFolder ? "Folder" : "File"}</span>
      <a
        href={item.webViewLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        {item.name}
      </a>
    </li>
  );
}

export function ClientDriveFiles({ drive }: { drive: ClientDriveContentsResult }) {
  if (!drive.linked) {
    return (
      <div className={portalCardCompactClass}>
        <h2 className={portalSectionHeadingClass}>Google Drive</h2>
        <p className="mt-2 text-sm text-muted">No Drive folder is linked to this client yet.</p>
      </div>
    );
  }

  if (drive.error) {
    return (
      <div className={portalCardCompactClass}>
        <h2 className={portalSectionHeadingClass}>Google Drive</h2>
        <p className="mt-2 text-sm text-red-800">{drive.error}</p>
      </div>
    );
  }

  return (
    <div className={portalCardCompactClass}>
      <h2 className={portalSectionHeadingClass}>Google Drive</h2>
      {drive.folderLink && drive.folderName && (
        <p className="mt-2 text-sm">
          <a
            href={drive.folderLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {drive.folderName}
          </a>
        </p>
      )}
      {drive.items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">This folder is empty.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {drive.items.map((item) => (
            <DriveItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
