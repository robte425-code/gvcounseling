import {
  portalCardCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

export function ClientDriveFilesLoading() {
  return (
    <div className={portalCardCompactClass} aria-busy="true" aria-live="polite">
      <h2 className={portalSectionHeadingClass}>Google Drive</h2>
      <p className="mt-2 text-sm text-muted">Loading folder and files…</p>
    </div>
  );
}
