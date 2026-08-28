"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";

/** Matches the server's allow-list in upload-validation.ts. */
const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp";

export function ClientDriveUpload({
  clientId,
  folderName,
}: {
  clientId: string;
  folderName: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedCount, setUploadedCount] = useState(0);

  function clearSelection() {
    setSelected([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload() {
    if (selected.length === 0 || uploading) return;

    setUploading(true);
    setError("");
    setUploadedCount(0);

    try {
      const data = new FormData();
      for (const file of selected) data.append("file", file);

      const response = await fetch(`/api/portal/clients/${clientId}/drive-files`, {
        method: "POST",
        body: data,
      });
      const body = (await response.json().catch(() => null)) as {
        uploaded?: { name: string }[];
        error?: string;
      } | null;

      if (!response.ok) {
        setError(body?.error ?? "Upload failed.");
        return;
      }

      setUploadedCount(body?.uploaded?.length ?? selected.length);
      clearSelection();
      // The file list is server-rendered, so it only picks up new files on a refresh.
      router.refresh();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(event) => {
            setSelected(Array.from(event.target.files ?? []));
            setError("");
            setUploadedCount(0);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs`}
          disabled={uploading}
        >
          Choose files
        </button>
        {selected.length > 0 && (
          <>
            <button
              type="button"
              onClick={handleUpload}
              className={`${portalButtonClass} px-4 py-1.5 text-xs`}
              disabled={uploading}
            >
              {uploading
                ? `Uploading ${selected.length} file${selected.length === 1 ? "" : "s"}…`
                : `Upload ${selected.length} file${selected.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-muted hover:underline"
              disabled={uploading}
            >
              Clear
            </button>
          </>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">
        PDF, Word, or image files up to 15 MB each. Uploaded to
        {folderName ? ` ${folderName}` : " this client's Drive folder"}.
      </p>

      {selected.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-primary-dark">
          {selected.map((file) => (
            <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          {error}
        </p>
      )}

      {uploadedCount > 0 && !error && (
        <p className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary-dark" role="status">
          Uploaded {uploadedCount} file{uploadedCount === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
