"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceAttachments } from "@/components/portal/InvoiceAttachments";
import { InvoiceEditor, type InvoiceLineItem } from "@/components/portal/InvoiceEditor";
import { buildInvoiceFormData, linesArePersistable } from "@/lib/invoice-form-data";
import { saveInvoiceDraftAction } from "@/lib/portal-actions";
import { portalCardClass } from "@/components/portal/ui";
import type { FeeScheduleRow } from "@/lib/procedure-fee-schedule";

type Props = {
  invoiceId: string;
  readOnly: boolean;
  initialLines: InvoiceLineItem[];
  therapistFeeSchedule?: FeeScheduleRow[];
  attachments: { id: string; filename: string; blobUrl: string }[];
  savedServiceDates: string[];
  actions?: React.ReactNode;
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
  actions,
}: Props) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [persistedServiceDates, setPersistedServiceDates] = useState(savedServiceDates);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineServiceDates = useMemo(() => uniqueServiceDates(lines), [lines]);

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
    <>
      <div className={portalCardClass}>
        <h2 className="mb-4 font-serif text-xl font-semibold text-primary-dark">Service lines</h2>
        <InvoiceEditor
          invoiceId={invoiceId}
          readOnly={readOnly}
          initialLines={initialLines}
          therapistFeeSchedule={therapistFeeSchedule}
          onLinesChange={setLines}
          actions={actions}
        />
      </div>

      <InvoiceAttachments
        invoiceId={invoiceId}
        readOnly={readOnly}
        attachments={attachments}
        lineServiceDates={lineServiceDates}
        savedServiceDates={persistedServiceDates}
      />
    </>
  );
}
