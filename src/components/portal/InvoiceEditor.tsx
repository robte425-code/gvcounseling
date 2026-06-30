"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  formatCurrency,
  formatProcedureCodeLabel,
  PROCEDURE_CODE_NOTICES,
  PROCEDURE_CODES,
} from "@/lib/constants";
import { resolveFeeAmount, type FeeScheduleRow } from "@/lib/procedure-fee-schedule";
import { submitInvoiceAction, type SubmitInvoiceState } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

type LineItem = {
  serviceDate: string;
  procedureCode: string;
  amount: string;
};

export type InvoiceLineItem = LineItem;

export function emptyInvoiceLine(): LineItem {
  return { serviceDate: "", procedureCode: "", amount: "" };
}

type ClientOption = {
  id: string;
  label: string;
};

type Props = {
  invoiceId?: string;
  readOnly: boolean;
  initialLines: LineItem[];
  actions?: React.ReactNode;
  clients?: ClientOption[];
  initialClientId?: string;
  therapistFeeSchedule?: FeeScheduleRow[];
  onLinesChange?: (lines: LineItem[]) => void;
  onClientChange?: (clientId: string) => void;
  onSubmitStateChange?: (state: SubmitInvoiceState, pending: boolean) => void;
  showSubmit?: boolean;
  formId?: string;
};

const submitInitialState: SubmitInvoiceState = {};

function ProcedureCodeNotice({ code }: { code: string }) {
  const notice = PROCEDURE_CODE_NOTICES[code];
  if (!notice) return null;

  return (
    <div className="sm:col-span-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {notice.intros?.map((text, index) => (
        <p key={text} className={index > 0 ? "mt-2" : undefined}>
          {text}
        </p>
      ))}
      <ul className={`list-disc space-y-1 pl-5 ${notice.intros?.length ? "mt-2" : ""}`}>
        {notice.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      {notice.footer || notice.footerLinks?.length ? (
        <p className="mt-2">
          {notice.footer}
          {notice.footerLinks?.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? " and " : null}
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline hover:text-primary-dark"
              >
                {link.label}
              </a>
            </span>
          ))}
          {notice.footerLinks?.length ? "." : null}
        </p>
      ) : null}
    </div>
  );
}

export function InvoiceEditor({
  invoiceId,
  readOnly,
  initialLines,
  actions,
  clients,
  initialClientId,
  therapistFeeSchedule,
  onLinesChange,
  onClientChange,
  onSubmitStateChange,
  showSubmit = true,
  formId,
}: Props) {
  const usesTherapistFees = therapistFeeSchedule !== undefined;
  const [submitState, submitAction, submitPending] = useActionState(
    submitInvoiceAction,
    submitInitialState,
  );

  function priceLine(line: LineItem): LineItem {
    if (!therapistFeeSchedule?.length || !line.serviceDate || !line.procedureCode) {
      return line;
    }
    const amount = resolveFeeAmount(therapistFeeSchedule, line.procedureCode, line.serviceDate);
    return { ...line, amount: amount !== null ? amount.toFixed(2) : "" };
  }

  const [clientId, setClientId] = useState(
    initialClientId ?? clients?.[0]?.id ?? "",
  );
  const [lines, setLines] = useState<LineItem[]>(() =>
    (initialLines.length ? initialLines : [emptyInvoiceLine()]).map(priceLine),
  );

  useEffect(() => {
    if (!usesTherapistFees) return;
    setLines((prev) => prev.map(priceLine));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reprice when fee schedule loads
  }, [therapistFeeSchedule]);

  useEffect(() => {
    onLinesChange?.(lines);
  }, [lines, onLinesChange]);

  useEffect(() => {
    onClientChange?.(clientId);
  }, [clientId, onClientChange]);

  useEffect(() => {
    onSubmitStateChange?.(submitState, submitPending);
  }, [submitState, submitPending, onSubmitStateChange]);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0),
    [lines],
  );

  function updateLine(index: number, patch: Partial<LineItem>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? priceLine({ ...line, ...patch }) : line)),
    );
  }

  function addLine() {
    setLines((prev) => {
      const serviceDate = prev[0]?.serviceDate ?? "";
      return [...prev, priceLine({ ...emptyInvoiceLine(), serviceDate })];
    });
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  if (readOnly) {
    return (
      <div className="space-y-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Service date</th>
              <th className="py-2 pr-4">Procedure</th>
              <th className="py-2 pr-4">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-2 pr-4">{line.serviceDate}</td>
                <td className="py-2 pr-4">{formatProcedureCodeLabel(line.procedureCode)}</td>
                <td className="py-2 pr-4">{formatCurrency(line.amount || 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="py-2 pr-4 text-right" colSpan={2}>
                Total
              </td>
              <td className="py-2 pr-4">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
        {actions}
      </div>
    );
  }

  return (
    <form id={formId} action={submitAction} className="space-y-4">
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      {clients ? (
        <div>
          <label className={portalLabelClass}>Client</label>
          <select
            name="clientId"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={portalInputClass}
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <input type="hidden" name="lineCount" value={lines.length} />
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-4">
            <input type="hidden" name={`line_${index}_serviceDate`} value={line.serviceDate} />
            <input type="hidden" name={`line_${index}_procedureCode`} value={line.procedureCode} />
            <input type="hidden" name={`line_${index}_amount`} value={line.amount} />
            <div>
              <label className={portalLabelClass}>Service date</label>
              <input
                type="date"
                required
                value={line.serviceDate}
                onChange={(e) => updateLine(index, { serviceDate: e.target.value })}
                className={portalInputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={portalLabelClass}>Procedure code</label>
              <select
                required
                value={line.procedureCode}
                onChange={(e) => updateLine(index, { procedureCode: e.target.value })}
                className={portalInputClass}
              >
                <option value="">Select procedure code</option>
                {PROCEDURE_CODES.map(({ code, description }) => (
                  <option key={code} value={code}>
                    {code} — {description}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={portalLabelClass}>Amount</label>
              {usesTherapistFees ? (
                <p className={`${portalInputClass} bg-muted/10 text-muted`}>
                  {line.amount ? formatCurrency(line.amount) : "No fee on file"}
                </p>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={line.amount}
                  onChange={(e) => updateLine(index, { amount: e.target.value })}
                  className={portalInputClass}
                />
              )}
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="text-sm text-red-700 hover:underline"
              >
                Remove
              </button>
            </div>
            <ProcedureCodeNotice code={line.procedureCode} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addLine} className={portalButtonSecondaryClass}>
          Add line
        </button>
        <p className="font-semibold">Total: {formatCurrency(total)}</p>
      </div>
      {usesTherapistFees && lines.some((line) => !line.amount) && (
        <p className="text-sm text-amber-900">
          One or more lines have no fee on file for the selected date. Ask admin to update your
          procedure code fees before submitting.
        </p>
      )}
      {submitState.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {submitState.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {showSubmit && (
          <button
            type="submit"
            className={portalButtonClass}
            disabled={submitPending || (usesTherapistFees && lines.some((line) => !line.amount))}
          >
            {submitPending ? "Submitting…" : "Submit invoice"}
          </button>
        )}
        {actions}
      </div>
    </form>
  );
}
