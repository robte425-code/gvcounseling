"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/constants";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

export function InvoiceAttachments({
  invoiceId,
  readOnly,
  attachments,
  lineServiceDates,
  savedServiceDates,
}: {
  invoiceId: string;
  readOnly: boolean;
  attachments: { id: string; filename: string; blobUrl: string }[];
  /** Service dates from the service lines form (may include unsaved edits). */
  lineServiceDates: string[];
  /** Service dates persisted on the invoice (required for upload). */
  savedServiceDates: string[];
}) {
  const [items, setItems] = useState(attachments);
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
    savedServiceDates.length > 0 &&
    selectedServiceDate &&
    savedServiceDates.includes(selectedServiceDate);

  useEffect(() => {
    setItems(attachments);
  }, [attachments]);

  useEffect(() => {
    if (lineServiceDates.length === 0) {
      setServiceDate("");
      return;
    }
    setServiceDate((current) =>
      lineServiceDates.includes(current) ? current : lineServiceDates[0]!,
    );
  }, [lineServiceDates]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canUpload || !selectedServiceDate) return;

    setUploading(true);
    setError("");
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("files") as HTMLInputElement;
    const files = fileInput?.files ? [...fileInput.files] : [];
    if (files.length === 0) {
      setError("Select at least one file.");
      setUploading(false);
      return;
    }

    const uploaded: { id: string; filename: string; blobUrl: string }[] = [];
    for (const file of files) {
      const data = new FormData();
      data.set("serviceDate", selectedServiceDate);
      data.set("file", file);
      const res = await fetch(`/api/portal/invoices/${invoiceId}/attachments`, {
        method: "POST",
        body: data,
      });
      const body = await res.json();
      if (!res.ok) {
        setUploading(false);
        setError(body.error ?? `Upload failed for ${file.name}`);
        if (uploaded.length) {
          setItems((prev) => [...prev, ...uploaded]);
        }
        return;
      }
      uploaded.push(body.attachment);
    }

    setUploading(false);
    setItems((prev) => [...prev, ...uploaded]);
    form.reset();
  }

  return (
    <div className={`${portalCardClass} space-y-4`}>
      <h2 className="font-serif text-xl font-semibold text-primary-dark">Attachments</h2>
      <p className="text-sm text-muted">
        Files are saved to the client&apos;s Google Drive folder under a subfolder named for the service date
        (mm-dd-yyyy).
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No files attached.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((a) => (
            <li key={a.id}>
              <a href={a.blobUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {a.filename}
              </a>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        lineServiceDates.length === 0 ? (
          <p className="text-sm text-amber-900">Add at least one service line with a date before uploading attachments.</p>
        ) : (
          <form onSubmit={handleUpload} className="space-y-3">
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
              <label className={portalLabelClass}>PDF or document</label>
              <input
                name="files"
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                multiple
                required
                className="mt-1 block w-full text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-800">{error}</p>}
            <button
              type="submit"
              disabled={uploading || !canUpload}
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
