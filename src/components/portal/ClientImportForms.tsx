"use client";

import { useState } from "react";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

type Therapist = { id: string; firstName: string; lastName: string };

type ImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  warnings?: string[];
  error?: string;
};

type DriveStatus = {
  connected: boolean;
  googleEmail?: string | null;
  message?: string | null;
  error?: string | null;
};

function ResultBox({ result }: { result: ImportResult | null }) {
  if (!result) return null;
  if (result.error) {
    return <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{result.error}</p>;
  }
  return (
    <div className="mt-4 space-y-2 rounded-xl bg-primary/5 px-4 py-3 text-sm">
      {result.created != null && <p>Created: {result.created}</p>}
      {result.updated != null && <p>Updated: {result.updated}</p>}
      {result.skipped != null && <p>Skipped: {result.skipped}</p>}
      {result.warnings?.map((w) => (
        <p key={w} className="text-amber-900">
          {w}
        </p>
      ))}
      {result.errors?.map((err) => (
        <p key={err} className="text-red-800">
          {err}
        </p>
      ))}
    </div>
  );
}

export function ClientImportForms({
  therapists,
  driveStatus,
}: {
  therapists: Therapist[];
  driveStatus: DriveStatus;
}) {
  const [referralResult, setReferralResult] = useState<ImportResult | null>(null);
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null);
  const [driveResult, setDriveResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [connected, setConnected] = useState(driveStatus.connected);
  const [googleEmail, setGoogleEmail] = useState(driveStatus.googleEmail ?? null);

  async function uploadReferral(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading("referral");
    setReferralResult(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch("/api/portal/clients/import-referral", { method: "POST", body: data });
    const body = (await res.json()) as ImportResult;
    setLoading(null);
    setReferralResult(body);
    if (res.ok) form.reset();
  }

  async function uploadCsv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading("csv");
    setCsvResult(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch("/api/portal/clients/import-csv", { method: "POST", body: data });
    const body = (await res.json()) as ImportResult;
    setLoading(null);
    setCsvResult(body);
    if (res.ok) form.reset();
  }

  async function syncFromDrive() {
    setLoading("drive");
    setDriveResult(null);
    const res = await fetch("/api/portal/clients/import-drive", { method: "POST" });
    const body = (await res.json()) as ImportResult;
    setLoading(null);
    setDriveResult(body);
  }

  async function disconnectDrive() {
    setLoading("disconnect");
    await fetch("/api/portal/integrations/google/disconnect", { method: "POST" });
    setConnected(false);
    setGoogleEmail(null);
    setLoading(null);
  }

  const therapistSelect = (
    <div>
      <label className={portalLabelClass}>Therapist (for new clients)</label>
      <select name="therapistId" required defaultValue={therapists[0]?.id} className={portalInputClass}>
        {therapists.map((t) => (
          <option key={t.id} value={t.id}>
            {t.firstName} {t.lastName}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <div className={`${portalCardClass} space-y-4`}>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Google Drive</h2>
        <p className="text-sm text-muted">
          Import clients from <strong>Maria: Client files</strong> and{" "}
          <strong>Steven: Client files</strong>. Each client folder should be named{" "}
          <code className="text-xs">&lt;claim #&gt; - &lt;client name&gt;</code> and contain a{" "}
          <strong>Referral Submission</strong> Google Doc.
        </p>

        {driveStatus.message && (
          <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
            {driveStatus.message}
          </p>
        )}
        {driveStatus.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {driveStatus.error}
          </p>
        )}

        {connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-primary-dark">
              Connected as <strong>{googleEmail ?? "Google account"}</strong>
            </p>
            <button
              type="button"
              onClick={syncFromDrive}
              disabled={loading !== null}
              className={portalButtonClass}
            >
              {loading === "drive" ? "Syncing…" : "Sync from Drive"}
            </button>
            <button
              type="button"
              onClick={disconnectDrive}
              disabled={loading !== null}
              className={portalButtonSecondaryClass}
            >
              {loading === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <a href="/api/portal/integrations/google/connect" className={portalButtonClass}>
            Connect Google Drive
          </a>
        )}

        <ResultBox result={driveResult} />
      </div>

      <form onSubmit={uploadReferral} className={`${portalCardClass} space-y-4`}>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Referral Submission (.docx)</h2>
        <p className="text-sm text-muted">
          Parses NPI, diagnoses (including label misspellings), claim #, client name, DOB, gender, and VRC info.
        </p>
        {therapistSelect}
        <div>
          <label className={portalLabelClass}>Referral file</label>
          <input name="file" type="file" accept=".docx" required className="block w-full text-sm" />
        </div>
        <button type="submit" disabled={loading === "referral"} className={portalButtonClass}>
          {loading === "referral" ? "Importing…" : "Import referral"}
        </button>
        <ResultBox result={referralResult} />
      </form>

      <form onSubmit={uploadCsv} className={`${portalCardClass} space-y-4`}>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">CSV import</h2>
        <p className="text-sm text-muted">
          Columns: claim_number, first_name, last_name, therapist_email (optional), vrc_name (optional)
        </p>
        {therapistSelect}
        <div>
          <label className={portalLabelClass}>CSV file</label>
          <input name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm" />
        </div>
        <button type="submit" disabled={loading === "csv"} className={portalButtonClass}>
          {loading === "csv" ? "Importing…" : "Import CSV"}
        </button>
        <ResultBox result={csvResult} />
      </form>
    </>
  );
}
