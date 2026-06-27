"use client";

import { useMemo, useState } from "react";
import {
  formatCurrency,
  formatProcedureCodeLabel,
  PROCEDURE_CODES,
} from "@/lib/constants";
import { saveInvoiceAction } from "@/lib/portal-actions";
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

type Props = {
  invoiceId: string;
  readOnly: boolean;
  initialLines: LineItem[];
  actions?: React.ReactNode;
};

const emptyLine = (): LineItem => ({
  serviceDate: new Date().toISOString().slice(0, 10),
  procedureCode: "96156",
  amount: "",
});

export function InvoiceEditor({ invoiceId, readOnly, initialLines, actions }: Props) {
  const [lines, setLines] = useState<LineItem[]>(
    initialLines.length ? initialLines : [emptyLine()],
  );

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0),
    [lines],
  );

  function updateLine(index: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
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
        </table>
        <p className="text-right font-semibold">Total: {formatCurrency(total)}</p>
        {actions}
      </div>
    );
  }

  return (
    <form action={saveInvoiceAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
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
                {PROCEDURE_CODES.map(({ code, description }) => (
                  <option key={code} value={code}>
                    {code} — {description}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={portalLabelClass}>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={line.amount}
                onChange={(e) => updateLine(index, { amount: e.target.value })}
                className={portalInputClass}
              />
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
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addLine} className={portalButtonSecondaryClass}>
          Add line
        </button>
        <p className="font-semibold">Total: {formatCurrency(total)}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={portalButtonClass}>
          Save invoice
        </button>
        {actions}
      </div>
    </form>
  );
}
