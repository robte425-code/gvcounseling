"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/constants";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

export type InvoiceAttachmentItem = {
  id: string;
  filename: string;
  blobUrl: string;
};

export function mergeUniqueAttachments(
  ...lists: InvoiceAttachmentItem[][]
): InvoiceAttachmentItem[] {
  const byId = new Map<string, InvoiceAttachmentItem>();
  for (const list of lists) {
    for (const item of list) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

export function InvoiceAttachments({
  invoiceId,
  readOnly,
  attachments,
  lineServiceDates,
  savedServiceDates,
  onAttachmentsUploaded,
}: {
  invoiceId: string;
  readOnly: boolean;
  attachments: InvoiceAttachmentItem[];
  /** Service dates from the service lines form (may include unsaved edits). */
  lineServiceDates: string[];
  /** Service dates persisted on the invoice (required for upload). */
  savedServiceDates: string[];
  onAttachmentsUploaded?: (uploaded: InvoiceAttachmentItem[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [serviceDate, setServiceDate] = useState(lineServiceDates[0] ?? "");

  const serviceDateOptions = useMemo(
    () =>
      lineServiceDates.map((date) => ({
        value: date,
        label: formatDate(date),
      })),
    [lineServiceDates],
  );

  const singleServiceDate = lineServiceDates.length === 1 ? lineServiceDates[0] : null;
  const selectedServiceDate = singleServiceDate ?? serviceDate;

  const canUpload =
    Boolean(invoiceId) &&
    savedServiceDates.length > 0 &&
    selectedServiceDate &&
    savedServiceDates.includes(selectedServiceDate);

  useEffect(() => {
    if (lineServiceDates.length === 0) {
      setServiceDate("");
      return;
    }
    setServiceDate((current) =>
      lineServiceDates.includes(current) ? current : lineServiceDates[0]!,
    );
  }, [lineServiceDates]);

  function handleFileSelection(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? [...e.target.files] : [];
    setSelectedFiles(files);
    setError("");
  }

  function clearSelectedFiles() {
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploadingRef.current) return;
    if (!invoiceId || !selectedServiceDate) return;

    if (!canUpload) {
      setError("Wait a moment for service lines to save, or match the service date on your lines.");
      return;
    }

    if (selectedFiles.length === 0) {
      setError("Select at least one file.");
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    setError("");

    const uploaded: InvoiceAttachmentItem[] = [];
    try {
    for (const file of selectedFiles) {
      const data = new FormData();
      data.set("serviceDate", selectedServiceDate);
      data.set("file", file);
      const res = await fetch(`/api/portal/invoices/${invoiceId}/attachments`, {
        method: "POST",
        body: data,
      });
      const body = (await res.json()) as { attachment?: InvoiceAttachmentItem; error?: string };
      if (!res.ok) {
        setError(body.error ?? `Upload failed for ${file.name}`);
        if (uploaded.length) {
          onAttachmentsUploaded?.(uploaded);
        }
        return;
      }
      if (!body.attachment?.id) {
        setError(`Upload failed for ${file.name}: invalid server response.`);
        if (uploaded.length) {
          onAttachmentsUploaded?.(uploaded);
        }
        return;
      }
      uploaded.push(body.attachment);
    }

    onAttachmentsUploaded?.(uploaded);
    clearSelectedFiles();
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  return (
    <div className={`${portalCardClass} space-y-4`}>
      <h2 className="font-serif text-xl font-semibold text-primary-dark">Attachments</h2>
      <p className="text-sm text-muted">
        Files are saved to the client&apos;s Google Drive folder under a subfolder named for the service date
        (mm-dd-yyyy).
      </p>

      <div>
        <h3 className={portalLabelClass}>Uploaded files</h3>
        {error && <p className="mt-1 text-sm text-red-800">{error}</p>}
        {attachments.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No files uploaded yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {a.filename}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!readOnly && (
        lineServiceDates.length === 0 ? (
          <p className="text-sm text-amber-900">Add at least one service line with a date before uploading attachments.</p>
        ) : !invoiceId ? (
          <p className="text-sm text-muted">Preparing invoice…</p>
        ) : (
          <form onSubmit={handleUpload} className="space-y-3 border-t border-border pt-4">
            <div>
              <span className={portalLabelClass}>Service date</span>
              {singleServiceDate ? (
                <>
                  <input type="hidden" name="serviceDate" value={singleServiceDate} />
                  <p className="mt-1 text-sm">{formatDate(singleServiceDate)}</p>
                </>
              ) : (
                <select
                  name="serviceDate"
                  required
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                  className={portalInputClass}
                >
                  {serviceDateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <span className={portalLabelClass}>PDF or document</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                multiple
                className="sr-only"
                onChange={handleFileSelection}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${portalButtonSecondaryClass} mt-1`}
              >
                Choose files
              </button>
            </div>
            {selectedFiles.length > 0 && (
              <div>
                <h3 className={portalLabelClass}>Files to upload</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {selectedFiles.map((file) => (
                    <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-red-800">{error}</p>}
            <button
              type="submit"
              disabled={uploading || !canUpload || selectedFiles.length === 0}
              className={portalButtonSecondaryClass}
            >
              {uploading ? "Uploading…" : "Upload files"}
            </button>
          </form>
        )
      )}
    </div>
  );
}
