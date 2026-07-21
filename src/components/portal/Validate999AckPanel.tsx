"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import type { Edi999ValidationResult } from "@/lib/parse-edi-999";

type ValidateResponse = {
  filename?: string;
  result?: Edi999ValidationResult;
  error?: string;
};

export function Validate999AckPanel() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [result, setResult] = useState<Edi999ValidationResult | null>(null);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setFilename(file.name);

    startTransition(async () => {
      const body = new FormData();
      body.append("file", file);
      try {
        const response = await fetch("/api/portal/bills/validate-999", {
          method: "POST",
          body,
        });
        const data = (await response.json()) as ValidateResponse;
        if (!response.ok) {
          setError(data.error ?? "Could not validate 999 file.");
          return;
        }
        if (!data.result) {
          setError("No validation result returned.");
          return;
        }
        setFilename(data.filename ?? file.name);
        setResult(data.result);
      } catch {
        setError("Could not validate 999 file.");
      }
    });
  }

  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>Acknowledgements</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
        Validate 999 ACK
      </h2>
      <p className="mt-1 text-xs text-muted">
        After uploading an 837 to Provider Express, drop the 999 acknowledgement here to confirm
        acceptance or see reject reasons (IK5 / AK9 and segment errors).
      </p>

      <div className="mt-4">
        <label className="block text-sm font-medium text-foreground" htmlFor="edi-999-file">
          999 acknowledgement file
        </label>
        <input
          id="edi-999-file"
          type="file"
          accept=".txt,.edi,text/plain,application/edi-x12,*/*"
          onChange={onFileChange}
          disabled={pending}
          className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-dark disabled:opacity-60"
        />
      </div>

      {pending && (
        <p className="mt-3 text-sm text-muted" role="status">
          Validating…
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              result.accepted ? "bg-emerald-50 text-emerald-950" : "bg-red-50 text-red-900"
            }`}
            role="status"
          >
            <p className="font-semibold">
              {result.accepted ? "Accepted" : "Rejected"}
              {filename ? ` · ${filename}` : ""}
            </p>
            <p className="mt-1">{result.summary}</p>
          </div>

          <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2">
            <div>
              <dt className="font-medium text-foreground">Transaction set (IK5)</dt>
              <dd>
                {result.transactionSetStatusLabel}
                {result.transactionSetStatus ? ` (${result.transactionSetStatus})` : ""}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Functional group (AK9)</dt>
              <dd>
                {result.functionalGroupStatusLabel}
                {result.functionalGroupStatus ? ` (${result.functionalGroupStatus})` : ""}
                {result.transactionSetsAccepted != null
                  ? ` · ${result.transactionSetsAccepted}/${result.transactionSetsReceived ?? "?"} accepted`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Acknowledged 837</dt>
              <dd>
                {result.acknowledgedTransactionSetId ?? "—"}
                {result.acknowledgedControlNumber
                  ? ` · control ${result.acknowledgedControlNumber}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Interchange</dt>
              <dd>
                {(result.interchangeSender ?? "—").trim()} →{" "}
                {(result.interchangeReceiver ?? "—").trim()}
                {result.interchangeDate ? ` · ${result.interchangeDate}` : ""}
              </dd>
            </div>
          </dl>

          {result.knownIssueHints.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {result.knownIssueHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}

          {result.segmentErrors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-primary-dark">
                Segment errors ({result.segmentErrorCount}) · element errors (
                {result.elementErrorCount})
              </p>
              <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                {result.segmentErrors.map((segError, index) => (
                  <li
                    key={`${segError.segmentId}-${segError.segmentPosition}-${index}`}
                    className="rounded-xl border border-border bg-primary/[0.02] px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-primary-dark">
                      {segError.segmentId ?? "?"}
                      {segError.segmentPosition ? ` @ ${segError.segmentPosition}` : ""}
                      {segError.loopId ? ` · loop ${segError.loopId}` : ""}
                      {segError.errorCode ? ` · ${segError.errorCode}` : ""}
                    </p>
                    <p className="mt-0.5 text-muted">{segError.explanation}</p>
                    {segError.elementErrors.map((elErr, elIndex) => (
                      <p key={elIndex} className="mt-1 text-muted">
                        Element {elErr.elementPosition ?? "?"}
                        {elErr.dataElementReference
                          ? ` (DE${elErr.dataElementReference})`
                          : ""}
                        {elErr.errorCode ? ` · ${elErr.errorCode}` : ""}
                        {": "}
                        {elErr.explanation}
                        {elErr.badValue ? ` — value “${elErr.badValue}”` : ""}
                      </p>
                    ))}
                    {segError.contextNotes.map((note) => (
                      <p key={note} className="mt-1 font-mono text-[11px] text-muted">
                        {note}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            className={`${portalButtonSecondaryClass} px-4 py-2 text-xs`}
            onClick={() => {
              setResult(null);
              setFilename(null);
              setError(null);
            }}
          >
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
