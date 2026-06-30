"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceAttachments } from "@/components/portal/InvoiceAttachments";
import { InvoiceEditor, type InvoiceLineItem } from "@/components/portal/InvoiceEditor";
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

function defaultLine(): InvoiceLineItem {
  return {
    serviceDate: new Date().toISOString().slice(0, 10),
    procedureCode: "96156",
    amount: "",
  };
}

export function NewInvoiceClient({ clients, initialClientId, therapistFeeSchedule }: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLineItem[]>([defaultLine()]);
  const [persistedServiceDates, setPersistedServiceDates] = useState<string[]>([]);
  const [draftError, setDraftError] = useState("");
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
        setPersistedServiceDates([new Date().toISOString().slice(0, 10)]);
      } catch (error) {
        if (!cancelled) {
          setDraftError(error instanceof Error ? error.message : "Could not create invoice draft.");
        }
      } finally {
        creatingDraftRef.current = false;
      }
    }

    setInvoiceId(null);
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
          initialLines={[defaultLine()]}
          invoiceId={invoiceId ?? undefined}
          therapistFeeSchedule={therapistFeeSchedule}
          clients={clients}
          initialClientId={initialClientId}
          onLinesChange={setLines}
          onClientChange={setClientId}
          showSubmit={false}
        />
      </div>

      <InvoiceAttachments
        invoiceId={invoiceId ?? ""}
        readOnly={false}
        attachments={[]}
        lineServiceDates={lineServiceDates}
        savedServiceDates={persistedServiceDates}
        onUploaded={() => router.refresh()}
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
        disabled={!canSubmit}
      >
        Submit invoice
      </button>
    </div>
  );
}
