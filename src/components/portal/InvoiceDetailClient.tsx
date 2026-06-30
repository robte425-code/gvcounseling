"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceAttachments } from "@/components/portal/InvoiceAttachments";
import { InvoiceEditor, type InvoiceLineItem } from "@/components/portal/InvoiceEditor";
import { buildInvoiceFormData, linesArePersistable } from "@/lib/invoice-form-data";
import { saveInvoiceDraftAction } from "@/lib/portal-actions";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import type { FeeScheduleRow } from "@/lib/procedure-fee-schedule";

const INVOICE_FORM_ID = "invoice-form";

type Props = {
  invoiceId: string;
  readOnly: boolean;
  initialLines: InvoiceLineItem[];
  therapistFeeSchedule?: FeeScheduleRow[];
  attachments: { id: string; filename: string; blobUrl: string }[];
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
  const [persistedServiceDates, setPersistedServiceDates] = useState(savedServiceDates);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineServiceDates = useMemo(() => uniqueServiceDates(lines), [lines]);

  const usesTherapistFees = therapistFeeSchedule !== undefined;
  const canSubmit =
    !readOnly &&
    linesArePersistable(lines) &&
    (!usesTherapistFees || !lines.some((line) => !line.amount));

  useEffect(() => {
    setPersistedServiceDates(savedServiceDates);
  }, [savedServiceDates]);

  useEffect(() => {
    if (readOnly || !linesArePersistable(lines)) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveInvoiceDraftAction(buildInvoiceFormData(lines, { invoiceId }));
        setPersistedServiceDates(uniqueServiceDates(lines));
        router.refresh();
      } catch {
        // Draft auto-save failed silently; attachments stay disabled until submit or retry.
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
          showSubmit={false}
        />
      </div>

      <InvoiceAttachments
        invoiceId={invoiceId}
        readOnly={readOnly}
        attachments={attachments}
        lineServiceDates={lineServiceDates}
        savedServiceDates={persistedServiceDates}
        onUploaded={() => router.refresh()}
      />

      {!readOnly && usesTherapistFees && lines.some((line) => !line.amount) && (
        <p className="text-sm text-amber-900">
          One or more lines have no fee on file for the selected date. Ask admin to update your
          procedure code fees before submitting.
        </p>
      )}

      {(footerActions || !readOnly) && (
        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && (
            <button
              type="submit"
              form={INVOICE_FORM_ID}
              className={portalButtonClass}
              disabled={!canSubmit}
            >
              Submit invoice
            </button>
          )}
          {footerActions}
        </div>
      )}
    </div>
  );
}
