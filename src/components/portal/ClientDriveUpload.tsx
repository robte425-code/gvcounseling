"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { portalButtonClass, portalButtonSecondaryClass } from "@/components/portal/ui";
import {
  DIRECT_UPLOAD_MAX_FILE_BYTES,
  REQUEST_UPLOAD_MAX_FILE_BYTES,
  directUploadMaxMb,
} from "@/lib/upload-validation";

/** Matches the server's allow-list in upload-validation.ts. */
const ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp";


/** Small files: straight through our route, which then writes to Drive. */
async function uploadViaServer(clientId: string, file: File): Promise<string | null> {
  const data = new FormData();
  data.append("file", file);

  const response = await fetch(`/api/portal/clients/${clientId}/drive-files`, {
    method: "POST",
    body: data,
  });
  if (response.ok) return null;

  // A 413 comes from the platform, not the route, so it is not JSON.
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return (
    body?.error ??
    (response.status === 413
      ? `${file.name} is too large to send through the server.`
      : `Upload failed for ${file.name}.`)
  );
}

/**
 * Larger files: the server mints a Google upload URL and the bytes go straight
 * there, so the platform's ~4.5 MB request body limit never applies.
 */
async function uploadDirectToDrive(clientId: string, file: File): Promise<string | null> {
  const sessionResponse = await fetch(`/api/portal/clients/${clientId}/drive-files/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  const sessionBody = (await sessionResponse.json().catch(() => null)) as {
    uploadUrl?: string;
    error?: string;
  } | null;

  if (!sessionResponse.ok || !sessionBody?.uploadUrl) {
    return sessionBody?.error ?? `Could not start the upload for ${file.name}.`;
  }

  try {
    const put = await fetch(sessionBody.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) {
      return `Google rejected the upload of ${file.name} (${put.status}).`;
    }
    return null;
  } catch {
    return `Could not send ${file.name} to Google Drive. Check your connection, or add the file in Drive directly.`;
  }
}

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

    const tooBig = selected.find((file) => file.size > DIRECT_UPLOAD_MAX_FILE_BYTES);
    if (tooBig) {
      setError(
        `${tooBig.name} is too large. Each file must be ${directUploadMaxMb()} MB or smaller.`,
      );
      setUploading(false);
      return;
    }

    let done = 0;
    try {
      // One request per file either way, so a batch of individually acceptable
      // files cannot add up past the body limit.
      for (const file of selected) {
        const failure =
          file.size > REQUEST_UPLOAD_MAX_FILE_BYTES
            ? await uploadDirectToDrive(clientId, file)
            : await uploadViaServer(clientId, file);

        if (failure) {
          setError(failure);
          break;
        }
        done += 1;
      }

      if (done > 0) {
        setUploadedCount(done);
        clearSelection();
        // The file list is server-rendered, so it only picks up new files on a refresh.
        router.refresh();
      }
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
        PDF, Word, or image files up to {directUploadMaxMb()} MB each. Uploaded to
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
