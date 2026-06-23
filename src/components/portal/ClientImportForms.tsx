"use client";

import { useState } from "react";
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
  errors?: string[];
  warnings?: string[];
  error?: string;
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

export function ClientImportForms({ therapists }: { therapists: Therapist[] }) {
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
