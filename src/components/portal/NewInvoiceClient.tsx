"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  InvoiceAttachments,
  mergeUniqueAttachments,
  type InvoiceAttachmentItem,
} from "@/components/portal/InvoiceAttachments";
import { InvoiceEditor, emptyInvoiceLine, type InvoiceLineItem } from "@/components/portal/InvoiceEditor";
import { buildInvoiceFormData, linesArePersistable } from "@/lib/invoice-form-data";
import { createInvoiceDraftAction, saveInvoiceDraftAction } from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import type { FeeScheduleRow } from "@/lib/procedure-fee-schedule";

const INVOICE_FORM_ID = "invoice-form";

type ClientOption = {
  id: string;
  label: string;
};

type Props = {
  clients: ClientOption[];
  initialClientId: string;
  therapistFeeSchedule?: FeeScheduleRow[];
};

function uniqueServiceDates(lines: InvoiceLineItem[]): string[] {
  const dates = lines
    .map((line) => line.serviceDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  return [...new Set(dates)];
}

export function NewInvoiceClient({ clients, initialClientId, therapistFeeSchedule }: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLineItem[]>([emptyInvoiceLine()]);
  const [attachments, setAttachments] = useState<InvoiceAttachmentItem[]>([]);
  const [persistedServiceDates, setPersistedServiceDates] = useState<string[]>([]);
  const [draftError, setDraftError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingDraftRef = useRef(false);

  const usesTherapistFees = therapistFeeSchedule !== undefined;
  const lineServiceDates = useMemo(() => uniqueServiceDates(lines), [lines]);
  const canSubmit =
    Boolean(invoiceId) &&
    linesArePersistable(lines) &&
    (!usesTherapistFees || !lines.some((line) => !line.amount));

  useEffect(() => {
    let cancelled = false;

    async function ensureDraft() {
      if (!clientId || creatingDraftRef.current) return;
      creatingDraftRef.current = true;
      setDraftError("");
      try {
        const { invoiceId: id } = await createInvoiceDraftAction(clientId);
        if (cancelled) return;
        setInvoiceId(id);
        if (linesArePersistable(lines)) {
          await saveInvoiceDraftAction(buildInvoiceFormData(lines, { invoiceId: id, clientId }));
          if (cancelled) return;
          setPersistedServiceDates(uniqueServiceDates(lines));
        }
      } catch (error) {
        if (!cancelled) {
          setDraftError(error instanceof Error ? error.message : "Could not create invoice draft.");
        }
      } finally {
        creatingDraftRef.current = false;
      }
    }

    setInvoiceId(null);
    setAttachments([]);
    setPersistedServiceDates([]);
    void ensureDraft();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- new draft when client changes
  }, [clientId]);

  useEffect(() => {
    if (!invoiceId || !linesArePersistable(lines)) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveInvoiceDraftAction(buildInvoiceFormData(lines, { invoiceId, clientId }));
        setPersistedServiceDates(uniqueServiceDates(lines));
        router.refresh();
      } catch {
        // Upload stays disabled until lines persist successfully.
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [clientId, invoiceId, lines, router]);

  return (
    <div className="space-y-8">
      <div className={portalCardClass}>
        <h2 className="mb-4 font-serif text-xl font-semibold text-primary-dark">Service lines</h2>
        {draftError ? <p className="mb-4 text-sm text-red-800">{draftError}</p> : null}
        <InvoiceEditor
          formId={INVOICE_FORM_ID}
          readOnly={false}
          initialLines={[emptyInvoiceLine()]}
          invoiceId={invoiceId ?? undefined}
          therapistFeeSchedule={therapistFeeSchedule}
          clients={clients}
          initialClientId={initialClientId}
          onLinesChange={setLines}
          onClientChange={setClientId}
          onSubmitStateChange={(state, pending) => {
            setSubmitError(state.error ?? "");
            setSubmitPending(pending);
          }}
          showSubmit={false}
        />
      </div>

      <InvoiceAttachments
        invoiceId={invoiceId ?? ""}
        readOnly={false}
        attachments={attachments}
        lineServiceDates={lineServiceDates}
        savedServiceDates={persistedServiceDates}
        onAttachmentsUploaded={(uploaded) =>
          setAttachments((prev) => mergeUniqueAttachments(prev, uploaded))
        }
      />

      {usesTherapistFees && lines.some((line) => !line.amount) && (
        <p className="text-sm text-amber-900">
          One or more lines have no fee on file for the selected date. Ask admin to update your
          procedure code fees before submitting.
        </p>
      )}

      <button
        type="submit"
        form={INVOICE_FORM_ID}
        className={portalButtonClass}
        disabled={!canSubmit || submitPending}
      >
        {submitPending ? "Submitting…" : "Submit invoice"}
      </button>
      {submitError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {submitError}
        </p>
      )}
    </div>
  );
}
