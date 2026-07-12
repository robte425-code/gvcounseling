"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyRemittanceAdviceAction,
  deleteRemittancePreviewAction,
  createWrongYearRebillAction,
  createWrongYearRebillsAction,
  finalizeTherapistPayRunAction,
  manualMatchRemittanceLineAction,
  rematchRemittanceAdviceAction,
  revertAppliedRemittanceAction,
  supersedeRemittanceLineAction,
  supersedeWrongYearStaleLinesAction,
  unmatchRemittanceLineAction,
  unsupersedeRemittanceLineAction,
  type ApplyRemittanceState,
  type CreateWrongYearRebillState,
  type DeleteRemittancePreviewState,
  type FinalizeTherapistPayRunState,
  type ManualMatchRemittanceState,
  type RematchRemittanceState,
  type RevertAppliedRemittanceState,
  type SupersedeRemittanceState,
  type UnmatchRemittanceState,
} from "@/lib/portal-actions";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";
import { formatCalendarIso } from "@/lib/constants";
import type { PaidToDeniedWarning } from "@/lib/remittance-paid-to-denied-warnings";
import { paidToDeniedWarningSummary } from "@/lib/remittance-paid-to-denied-warnings";

type DriveRemittanceFile = {
  id: string;
  name: string;
  webViewLink: string;
  invoiceDate: string | null;
  alreadyImported: boolean;
  remittanceAdviceId: string | null;
  remittanceNumber: string | null;
  status: string | null;
};

type ImportResponse = {
  remittanceAdviceId?: string;
  lastRemittanceAdviceId?: string | null;
  imported?: number;
  failed?: number;
  error?: string;
  results?: Array<{
    name: string;
    status: "imported" | "failed";
    remittanceAdviceId?: string;
    error?: string;
  }>;
};

export function RemittanceImportForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveRemittanceFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [selectedDriveIds, setSelectedDriveIds] = useState<Set<string>>(new Set());
  const [localFiles, setLocalFiles] = useState<File[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDriveFiles() {
      setDriveLoading(true);
      setDriveError(null);
      try {
        const response = await fetch("/api/portal/remittance/drive");
        const body = (await response.json()) as { files?: DriveRemittanceFile[]; error?: string };
        if (!response.ok) {
          if (!cancelled) setDriveError(body.error ?? "Could not load LNI RAs folder.");
          return;
        }
        if (!cancelled) setDriveFiles(body.files ?? []);
      } catch {
        if (!cancelled) setDriveError("Could not load LNI RAs folder.");
      } finally {
        if (!cancelled) setDriveLoading(false);
      }
    }

    void loadDriveFiles();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectableDriveFiles = useMemo(
    () => driveFiles.filter((file) => !file.alreadyImported),
    [driveFiles],
  );

  function toggleDriveFile(fileId: string, checked: boolean) {
    setSelectedDriveIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }

  function selectUnimportedDriveFiles() {
    setSelectedDriveIds(new Set(selectableDriveFiles.map((file) => file.id)));
  }

  function clearDriveSelection() {
    setSelectedDriveIds(new Set());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (selectedDriveIds.size === 0 && localFiles.length === 0) {
      setError("Select at least one remittance PDF from LNI RAs or upload files.");
      return;
    }

    setLoading(true);

    const data = new FormData();
    data.set("driveFileIds", JSON.stringify([...selectedDriveIds]));
    for (const file of localFiles) {
      data.append("file", file);
    }

    try {
      const response = await fetch("/api/portal/remittance/import", {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as ImportResponse;

      if (!response.ok) {
        setError(body.error ?? "Remittance import failed.");
        setLoading(false);
        return;
      }

      if ((body.imported ?? 0) === 1 && (body.failed ?? 0) === 0 && body.remittanceAdviceId) {
        router.push(`/portal/admin/pay/${body.remittanceAdviceId}`);
        return;
      }

      const params = new URLSearchParams();
      if ((body.imported ?? 0) > 0) params.set("imported", String(body.imported));
      if ((body.failed ?? 0) > 0) params.set("failed", String(body.failed));
      router.push(`/portal/admin/pay?${params.toString()}`);
    } catch {
      setError("Remittance import failed. Check your connection and try again.");
      setLoading(false);
    }
  }

  const selectionCount = selectedDriveIds.size + localFiles.length;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className={portalLabelCompactClass}>LNI RAs folder (Google Drive)</label>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={selectUnimportedDriveFiles}
              disabled={loading || driveLoading || selectableDriveFiles.length === 0}
            >
              Select unimported
            </button>
            <button
              type="button"
              className="text-muted hover:underline"
              onClick={clearDriveSelection}
              disabled={loading || selectedDriveIds.size === 0}
            >
              Clear
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Choose one or more remittance PDFs. Imports run oldest-to-newest by filename date.
        </p>

        {driveLoading && (
          <p className="mt-3 text-sm text-muted">Loading LNI RAs folder…</p>
        )}
        {driveError && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            {driveError}
          </p>
        )}

        {!driveLoading && !driveError && driveFiles.length === 0 && (
          <p className="mt-3 text-sm text-muted">No remittance PDFs found in LNI RAs.</p>
        )}

        {!driveLoading && driveFiles.length > 0 && (
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
            {driveFiles.map((file) => {
              const checked = selectedDriveIds.has(file.id);
              const disabled = loading || file.alreadyImported;
              return (
                <li
                  key={file.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    file.alreadyImported
                      ? "border-border bg-primary/[0.02] opacity-70"
                      : checked
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-border"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => toggleDriveFile(file.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-primary-dark">
                        {file.invoiceDate ? formatCalendarIso(file.invoiceDate) : "Unknown date"}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{file.name}</span>
                      {file.alreadyImported && (
                        <span className="mt-1 block text-xs text-muted">
                          Already imported
                          {file.remittanceNumber ? ` · RA ${file.remittanceNumber}` : ""}
                        </span>
                      )}
                    </span>
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-primary hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open
                    </a>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="remittance-pdf" className={portalLabelCompactClass}>
          Or upload PDFs
        </label>
        <input
          id="remittance-pdf"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={loading}
          onChange={(event) => setLocalFiles(Array.from(event.target.files ?? []))}
          className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-dark"
        />
        {localFiles.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            {localFiles.length} local file{localFiles.length === 1 ? "" : "s"} selected
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading || selectionCount === 0} className={portalButtonClass}>
        {loading
          ? "Importing…"
          : selectionCount > 1
            ? `Import ${selectionCount} remittances`
            : "Import & preview"}
      </button>
    </form>
  );
}

type ApplyProps = {
  remittanceAdviceId: string;
  matchedCount: number;
  unmatchedCount: number;
  therapistTotal: number;
  paidToDeniedWarnings?: PaidToDeniedWarning[];
};

const applyInitialState: ApplyRemittanceState = {};

export function ApplyRemittanceForm({
  remittanceAdviceId,
  matchedCount,
  unmatchedCount,
  therapistTotal,
  paidToDeniedWarnings = [],
}: ApplyProps) {
  const [state, formAction, pending] = useActionState(applyRemittanceAdviceAction, applyInitialState);
  const hasUnmatched = unmatchedCount > 0;
  const flipDeniedWarnings = paidToDeniedWarnings.filter((warning) => !warning.willRemainPaid);
  const remainPaidWarnings = paidToDeniedWarnings.filter((warning) => warning.willRemainPaid);
  const warningSummary = paidToDeniedWarningSummary(paidToDeniedWarnings);

  return (
    <form action={formAction}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      {paidToDeniedWarnings.length > 0 && (
        <div className="mb-3 space-y-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          <p className="font-semibold">Previously paid invoices on this remittance</p>
          <ul className="space-y-2">
            {paidToDeniedWarnings.map((warning) => (
              <li key={warning.lineId}>
                <span className="font-medium">
                  Invoice #{warning.invoiceNumber} · {warning.claimNumber}
                </span>
                {warning.patientName ? ` · ${warning.patientName}` : ""}
                {" — "}
                {warning.willRemainPaid
                  ? "Duplicate denial (EOB 309/101); invoice will remain PAID (no clawback on this warrant)."
                  : "Would change from PAID to DENIED on apply."}
                {warning.eobNote ? (
                  <p className="mt-0.5 text-xs text-amber-900">{warning.eobNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasUnmatched && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span className="font-semibold">
            {unmatchedCount} unmatched bill{unmatchedCount === 1 ? "" : "s"}
          </span>
          {" — "}
          every bill must match an invoice before this remittance can be applied. Review the bills
          list and resolve missing invoices or matching issues.
        </p>
      )}
      {state.error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Apply this remittance?\n\n${matchedCount} matched bill(s) will update invoice L&I status (paid, denied, or in-process).\n\nTherapist pay total: $${therapistTotal.toFixed(2)} (from fee schedule on paid invoices).${
          warningSummary ? `\n\n${warningSummary}` : ""
        }${
          flipDeniedWarnings.length
            ? `\n\n${flipDeniedWarnings.length} invoice(s) will change from PAID to DENIED.`
            : ""
        }${
          remainPaidWarnings.length
            ? `\n\n${remainPaidWarnings.length} duplicate-paid denial(s) (EOB 309/101) will be recorded but those invoices will stay PAID.`
            : ""
        }`}
        className={portalButtonClass}
        disabled={pending || hasUnmatched}
      >
        {pending ? "Applying…" : "Apply remittance & create pay run"}
      </ConfirmSubmitButton>
    </form>
  );
}

const finalizePayRunInitialState: FinalizeTherapistPayRunState = {};

export function FinalizeTherapistPayRunForm({
  remittanceAdviceId,
  therapistCount,
  therapistTotal,
}: {
  remittanceAdviceId: string;
  therapistCount: number;
  therapistTotal: number;
}) {
  const [state, formAction, pending] = useActionState(
    finalizeTherapistPayRunAction,
    finalizePayRunInitialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Finalize therapist pay for this remittance?\n\n${therapistCount} therapist(s) will be emailed their payout totaling $${therapistTotal.toFixed(2)}.`}
        className={portalButtonClass}
        disabled={pending}
      >
        {pending ? "Finalizing…" : "Finalize therapist pay"}
      </ConfirmSubmitButton>
    </form>
  );
}

export type WrongYearSupersedeSuggestionView = {
  lineId: string;
  claimNumber: string;
  raServiceDates: string[];
  correctedServiceDates: string[];
  invoiceNumber: number;
  note: string;
};

const supersedeInitialState: SupersedeRemittanceState = {};
const rebillInitialState: CreateWrongYearRebillState = {};

export function CreateWrongYearRebillsForm({
  remittanceAdviceId,
  suggestions,
}: {
  remittanceAdviceId: string;
  suggestions: WrongYearSupersedeSuggestionView[];
}) {
  const [state, formAction, pending] = useActionState(createWrongYearRebillsAction, rebillInitialState);

  if (suggestions.length === 0) return null;

  return (
    <form action={formAction} className="rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-3">
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <p className="text-sm font-medium text-primary-dark">Create rebills for wrong-year denials</p>
      <p className="mt-1 text-xs text-muted">
        Clones each source invoice with correct DOS as a new BILLED/UNPAID invoice (
        <code className="text-[11px]">submittedAt</code> unset) ready for L&I resubmission. Skips
        lines where an unsubmitted rebill already exists.
      </p>
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Create rebill invoices for ${suggestions.length} wrong-year line${suggestions.length === 1 ? "" : "s"}?\n\nNew invoice numbers will be assigned. Source invoices are left unchanged.`}
        className={`${portalButtonClass} mt-3`}
        disabled={pending}
      >
        {pending ? "Creating…" : `Create ${suggestions.length} rebill${suggestions.length === 1 ? "" : "s"}`}
      </ConfirmSubmitButton>
    </form>
  );
}

export function CreateWrongYearRebillForm({
  remittanceAdviceId,
  lineId,
}: {
  remittanceAdviceId: string;
  lineId: string;
}) {
  const [state, formAction, pending] = useActionState(createWrongYearRebillAction, rebillInitialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <input type="hidden" name="lineId" value={lineId} />
      {state.error && (
        <p className="mb-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage="Create a rebill invoice with the correct DOS for L&I resubmission?"
        className={`${portalButtonSecondaryClass} px-2 py-1 text-xs`}
        disabled={pending}
      >
        {pending ? "…" : "Create rebill"}
      </ConfirmSubmitButton>
    </form>
  );
}

export function SupersedeWrongYearStaleLinesForm({
  remittanceAdviceId,
  suggestions,
}: {
  remittanceAdviceId: string;
  suggestions: WrongYearSupersedeSuggestionView[];
}) {
  const [state, formAction, pending] = useActionState(
    supersedeWrongYearStaleLinesAction,
    supersedeInitialState,
  );

  if (suggestions.length === 0) return null;

  return (
    <form action={formAction} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <p className="text-sm font-medium text-primary-dark">
        {suggestions.length} stale wrong-year line{suggestions.length === 1 ? "" : "s"} detected
      </p>
      <p className="mt-1 text-xs text-muted">
        These L&I lines show the wrong service year but a resubmitted invoice exists with the
        correct date. Superseding excludes them from matching and apply — invoice payment status is
        unchanged.
      </p>
      <ul className="mt-3 space-y-2 text-xs text-muted">
        {suggestions.map((suggestion) => (
          <li key={suggestion.lineId}>
            <span className="font-medium text-primary-dark">{suggestion.claimNumber}</span>
            {" · "}
            L&I {suggestion.raServiceDates.join(", ")} → invoice #{suggestion.invoiceNumber}{" "}
            {suggestion.correctedServiceDates.join(", ")}
          </li>
        ))}
      </ul>
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Supersede ${suggestions.length} stale wrong-year line${suggestions.length === 1 ? "" : "s"}?\n\nThese lines will no longer block applying this remittance.`}
        className={`${portalButtonSecondaryClass} mt-3`}
        disabled={pending}
      >
        {pending ? "Superseding…" : `Supersede ${suggestions.length} stale wrong-year line${suggestions.length === 1 ? "" : "s"}`}
      </ConfirmSubmitButton>
    </form>
  );
}

export function SupersedeRemittanceLineForm({
  remittanceAdviceId,
  lineId,
  defaultNote,
}: {
  remittanceAdviceId: string;
  lineId: string;
  defaultNote?: string;
}) {
  const [state, formAction, pending] = useActionState(
    supersedeRemittanceLineAction,
    supersedeInitialState,
  );

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <input type="hidden" name="lineId" value={lineId} />
      {defaultNote && <input type="hidden" name="note" value={defaultNote} />}
      {state.error && (
        <p className="mb-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage="Supersede this stale line? It will no longer block applying this remittance."
        className={`${portalButtonSecondaryClass} px-2 py-1 text-xs`}
        disabled={pending}
      >
        {pending ? "…" : "Supersede stale line"}
      </ConfirmSubmitButton>
    </form>
  );
}

export function UnsupersedeRemittanceLineForm({
  remittanceAdviceId,
  lineId,
}: {
  remittanceAdviceId: string;
  lineId: string;
}) {
  const [state, formAction, pending] = useActionState(
    unsupersedeRemittanceLineAction,
    supersedeInitialState,
  );

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <input type="hidden" name="lineId" value={lineId} />
      {state.error && (
        <p className="mb-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-primary hover:underline disabled:opacity-50"
      >
        {pending ? "Undoing…" : "Undo supersede"}
      </button>
    </form>
  );
}

type DeletePreviewProps = {
  remittanceAdviceId: string;
  remittanceNumber: string;
  warrantRegister: string;
  compact?: boolean;
};

const deletePreviewInitialState: DeleteRemittancePreviewState = {};

export function DeleteRemittancePreviewForm({
  remittanceAdviceId,
  remittanceNumber,
  warrantRegister,
  compact = false,
}: DeletePreviewProps) {
  const [state, formAction, pending] = useActionState(
    deleteRemittancePreviewAction,
    deletePreviewInitialState,
  );

  return (
    <form action={formAction} className={compact ? "shrink-0" : undefined}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      {state.error && (
        <p
          className={`${compact ? "mb-2" : "mb-3"} rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800`}
          role="alert"
        >
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Delete preview for remittance ${remittanceNumber} (warrant ${warrantRegister})?\n\nMatched invoice EOB previews will be cleared or restored. You can import the same PDF again afterward.`}
        className={
          compact
            ? `${portalButtonSecondaryClass} border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50`
            : `${portalButtonSecondaryClass} border-red-200 text-red-700 hover:bg-red-50`
        }
        disabled={pending}
      >
        {pending ? "Deleting…" : compact ? "Delete" : "Delete preview"}
      </ConfirmSubmitButton>
    </form>
  );
}

const rematchInitialState: RematchRemittanceState = {};

export function RematchRemittanceForm({
  remittanceAdviceId,
  matchedCount,
  unresolvedCount,
}: {
  remittanceAdviceId: string;
  matchedCount: number;
  unresolvedCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    rematchRemittanceAdviceAction,
    rematchInitialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      {state.error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <p className="text-sm text-muted">
        Re-run automatic matching for all active lines ({matchedCount} matched, {unresolvedCount}{" "}
        unresolved). Invoice EOB previews update for affected matches.
      </p>
      <ConfirmSubmitButton
        confirmMessage="Re-match all bills on this remittance?\n\nExisting manual matches may change."
        className={`${portalButtonSecondaryClass} mt-3`}
        disabled={pending}
      >
        {pending ? "Re-matching…" : "Re-match all bills"}
      </ConfirmSubmitButton>
    </form>
  );
}

const unmatchInitialState: UnmatchRemittanceState = {};

export function UnmatchRemittanceLineForm({
  remittanceAdviceId,
  lineId,
  invoiceNumber,
}: {
  remittanceAdviceId: string;
  lineId: string;
  invoiceNumber: number;
}) {
  const [state, formAction, pending] = useActionState(
    unmatchRemittanceLineAction,
    unmatchInitialState,
  );

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <input type="hidden" name="lineId" value={lineId} />
      {state.error && (
        <p className="mb-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Unmatch invoice #${invoiceNumber} from this bill?\n\nEOB preview on the invoice will be updated.`}
        className={`${portalButtonSecondaryClass} px-2 py-1 text-xs`}
        disabled={pending}
      >
        {pending ? "…" : "Unmatch"}
      </ConfirmSubmitButton>
    </form>
  );
}

const manualMatchInitialState: ManualMatchRemittanceState = {};

export function ManualMatchRemittanceLineForm({
  remittanceAdviceId,
  lineId,
  claimNumber,
}: {
  remittanceAdviceId: string;
  lineId: string;
  claimNumber: string;
}) {
  const [state, formAction, pending] = useActionState(
    manualMatchRemittanceLineAction,
    manualMatchInitialState,
  );

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      <input type="hidden" name="lineId" value={lineId} />
      <div>
        <label className={portalLabelCompactClass} htmlFor={`invoice-${lineId}`}>
          Invoice # (claim {claimNumber})
        </label>
        <input
          id={`invoice-${lineId}`}
          name="invoiceNumber"
          type="number"
          min={1}
          required
          className={portalInputCompactClass}
          placeholder="e.g. 1042"
        />
      </div>
      {state.error && (
        <p className="w-full rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`${portalButtonSecondaryClass} px-2 py-1 text-xs disabled:opacity-50`}
      >
        {pending ? "Matching…" : "Match invoice"}
      </button>
    </form>
  );
}

const revertInitialState: RevertAppliedRemittanceState = {};

export function RevertAppliedRemittanceForm({
  remittanceAdviceId,
  remittanceNumber,
  warrantRegister,
}: {
  remittanceAdviceId: string;
  remittanceNumber: string;
  warrantRegister: string;
}) {
  const [state, formAction, pending] = useActionState(
    revertAppliedRemittanceAction,
    revertInitialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
      {state.error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      <ConfirmSubmitButton
        confirmMessage={`Revert applied remittance ${remittanceNumber} (warrant ${warrantRegister})?\n\nThis deletes the pay run draft and recomputes L&I payment on affected invoices.`}
        className={`${portalButtonSecondaryClass} border-red-200 text-red-700 hover:bg-red-50`}
        disabled={pending}
      >
        {pending ? "Reverting…" : "Revert applied remittance"}
      </ConfirmSubmitButton>
    </form>
  );
}
