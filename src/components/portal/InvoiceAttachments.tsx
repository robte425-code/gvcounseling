"use client";

import { useState } from "react";
import { portalButtonSecondaryClass, portalCardClass, portalLabelClass } from "@/components/portal/ui";

export function InvoiceAttachments({
  invoiceId,
  readOnly,
  attachments,
}: {
  invoiceId: string;
  readOnly: boolean;
  attachments: { id: string; filename: string; blobUrl: string }[];
}) {
  const [items, setItems] = useState(attachments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

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
  }

  return (
    <div className={`${portalCardClass} space-y-4`}>
      <h2 className="font-serif text-xl font-semibold text-primary-dark">Attachments</h2>
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
        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label className={portalLabelClass}>PDF or document</label>
            <input name="file" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required />
          </div>
          {error && <p className="text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={uploading} className={portalButtonSecondaryClass}>
            {uploading ? "Uploading…" : "Upload file"}
          </button>
        </form>
      )}
    </div>
  );
}
