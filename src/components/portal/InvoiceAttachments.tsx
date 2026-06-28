"use client";

import { useMemo, useState } from "react";
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
  serviceDates,
}: {
  invoiceId: string;
  readOnly: boolean;
  attachments: { id: string; filename: string; blobUrl: string }[];
  serviceDates: string[];
}) {
  const [items, setItems] = useState(attachments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [serviceDate, setServiceDate] = useState(serviceDates[0] ?? "");

  const serviceDateOptions = useMemo(
    () =>
      serviceDates.map((date) => ({
        value: date,
        label: formatDate(date),
      })),
    [serviceDates],
  );

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch(`/api/portal/invoices/${invoiceId}/attachments`, {
      method: "POST",
      body: data,
    });
    const body = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(body.error ?? "Upload failed");
      return;
    }
    setItems((prev) => [...prev, body.attachment]);
    form.reset();
    if (serviceDates[0]) setServiceDate(serviceDates[0]);
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
        serviceDates.length === 0 ? (
          <p className="text-sm text-amber-900">Save at least one service line before uploading attachments.</p>
        ) : (
          <form onSubmit={handleUpload} className="space-y-3">
            <div>
              <label className={portalLabelClass}>Service date</label>
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
            </div>
            <div>
              <label className={portalLabelClass}>PDF or document</label>
              <input name="file" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required />
            </div>
            {error && <p className="text-sm text-red-800">{error}</p>}
            <button type="submit" disabled={uploading} className={portalButtonSecondaryClass}>
              {uploading ? "Uploading…" : "Upload file"}
            </button>
          </form>
        )
      )}
    </div>
  );
}
