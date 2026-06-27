"use client";

import { useState } from "react";
import { DriveImportResultBox } from "@/components/portal/DriveImportResultBox";
import { GoogleDriveConnectionPanel } from "@/components/portal/GoogleDriveConnectionPanel";
import {
  portalButtonClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

type Therapist = { id: string; firstName: string; lastName: string };

type ImportResult = {
  created?: number;
  updated?: number;
  closed?: number;
  unchanged?: number;
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

export function ClientImportForms({
  therapists,
  driveStatus,
}: {
  therapists: Therapist[];
  driveStatus: DriveStatus;
}) {
  const [referralResult, setReferralResult] = useState<ImportResult | null>(null);
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

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
      <GoogleDriveConnectionPanel
        driveStatus={driveStatus}
        description={
          <>
            Import clients from <strong>Maria: Client files</strong> and{" "}
            <strong>Steven: Client files</strong>. When Maria or Steven connect their own Google
            accounts, sync uses their credentials for their folder; otherwise your admin connection
            is used. Sync checks for new or removed folders only — existing clients are not
            re-imported unless you use <strong>Re-sync from Drive</strong> on a client page.
            Removed Drive folders mark clients as closed. Each client folder should be named{" "}
            <code className="text-xs">&lt;claim #&gt; - &lt;client name&gt;</code> and contain a{" "}
            <strong>Referral Submission</strong> Google Doc.
          </>
        }
      />

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
        <DriveImportResultBox result={referralResult} />
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
        <DriveImportResultBox result={csvResult} />
      </form>
    </>
  );
}
