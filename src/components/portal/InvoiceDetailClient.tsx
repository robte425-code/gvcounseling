"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  InvoiceAttachments,
  mergeUniqueAttachments,
  type InvoiceAttachmentItem,
} from "@/components/portal/InvoiceAttachments";
import { InvoiceEditor, type InvoiceLineItem } from "@/components/portal/InvoiceEditor";
import {
  buildInvoiceFormData,
  INVOICE_SUBMIT_REQUIRES_ATTACHMENT_MESSAGE,
  linesArePersistable,
} from "@/lib/invoice-form-data";
import { saveInvoiceDraftAction } from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import type { FeeScheduleRow } from "@/lib/procedure-fee-schedule";

const INVOICE_FORM_ID = "invoice-form";

type Props = {
  invoiceId: string;
  readOnly: boolean;
  initialLines: InvoiceLineItem[];
  therapistFeeSchedule?: FeeScheduleRow[];
  attachments: InvoiceAttachmentItem[];
  savedServiceDates: string[];
  footerActions?: React.ReactNode;
};

function uniqueServiceDates(lines: InvoiceLineItem[]): string[] {
  const dates = lines
    .map((line) => line.serviceDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  return [...new Set(dates)];
}

export function InvoiceDetailClient({
  invoiceId,
  readOnly,
  initialLines,
  therapistFeeSchedule,
  attachments,
  savedServiceDates,
  footerActions,
}: Props) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [attachmentItems, setAttachmentItems] = useState(attachments);
  const [persistedServiceDates, setPersistedServiceDates] = useState(savedServiceDates);
  const [submitError, setSubmitError] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineServiceDates = useMemo(() => uniqueServiceDates(lines), [lines]);

  const serverAttachmentIds = useMemo(
    () => attachments.map((attachment) => attachment.id).join("|"),
    [attachments],
  );

  const usesTherapistFees = therapistFeeSchedule !== undefined;
  const hasAttachment = attachmentItems.length > 0;
  const canSubmit =
    !readOnly &&
    linesArePersistable(lines) &&
    hasAttachment &&
    (!usesTherapistFees || !lines.some((line) => !line.amount));

  useEffect(() => {
    setPersistedServiceDates(savedServiceDates);
  }, [savedServiceDates]);

  useEffect(() => {
    // Merge instead of replace: a stale router.refresh() must not erase uploads
    // that already succeeded client-side (and are in the DB) before cache catches up.
    setAttachmentItems((prev) => mergeUniqueAttachments(prev, attachments));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when server attachment ids change, not array reference
  }, [serverAttachmentIds]);

  useEffect(() => {
    if (readOnly || !linesArePersistable(lines)) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveInvoiceDraftAction(buildInvoiceFormData(lines, { invoiceId }));
        setPersistedServiceDates(uniqueServiceDates(lines));
        setDraftSaveError("");
        router.refresh();
      } catch (error) {
        setDraftSaveError(
          error instanceof Error
            ? error.message
            : "Could not save draft. Attachments stay disabled until lines save.",
        );
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [invoiceId, lines, readOnly, router]);

  return (
    <div className="space-y-8">
      <div className={portalCardClass}>
        <h2 className="mb-4 font-serif text-xl font-semibold text-primary-dark">Service lines</h2>
        <InvoiceEditor
          formId={INVOICE_FORM_ID}
          invoiceId={invoiceId}
          readOnly={readOnly}
          initialLines={initialLines}
          therapistFeeSchedule={therapistFeeSchedule}
          onLinesChange={setLines}
          onSubmitStateChange={(state, pending) => {
            setSubmitError(state.error ?? "");
            setSubmitPending(pending);
          }}
          showSubmit={false}
        />
      </div>

      <InvoiceAttachments
        invoiceId={invoiceId}
        readOnly={readOnly}
        attachments={attachmentItems}
        lineServiceDates={lineServiceDates}
        savedServiceDates={persistedServiceDates}
        onAttachmentsUploaded={(uploaded) => {
          setAttachmentItems((prev) => mergeUniqueAttachments(prev, uploaded));
          router.refresh();
        }}
      />

      {draftSaveError && !readOnly && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          {draftSaveError}
        </p>
      )}

      {!readOnly && usesTherapistFees && lines.some((line) => !line.amount) && (
        <p className="text-sm text-amber-900">
          One or more lines have no fee on file for the selected date. Ask admin to update your
          procedure code fees before submitting.
        </p>
      )}

      {!readOnly && !hasAttachment && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          {INVOICE_SUBMIT_REQUIRES_ATTACHMENT_MESSAGE}
        </p>
      )}

      {(footerActions || !readOnly) && (
        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && (
            <button
              type="submit"
              form={INVOICE_FORM_ID}
              className={portalButtonClass}
              disabled={!canSubmit || submitPending}
            >
              {submitPending ? "Submitting…" : "Submit invoice"}
            </button>
          )}
          {!readOnly && submitError && (
            <p className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {submitError}
            </p>
          )}
          {footerActions}
        </div>
      )}
    </div>
  );
}
