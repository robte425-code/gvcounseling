"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/constants";
import type { Edi837BatchReport } from "@/lib/edi837-batch-report";
import type { IsaUsageIndicator } from "@/lib/edi837";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
} from "@/components/portal/ui";
import { Generate837Form } from "@/components/portal/Generate837Form";

type Props = {
  payPeriodId: string;
  periodLabel: string;
  usageIndicator: IsaUsageIndicator;
};

export function Review837BatchButton({ payPeriodId, periodLabel, usageIndicator }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Edi837BatchReport | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/portal/bills/batch-report?payPeriodId=${encodeURIComponent(payPeriodId)}`,
      );
      const body = (await response.json()) as Edi837BatchReport | { error?: string };
      if (!response.ok) {
        throw new Error("error" in body ? body.error : "Could not load batch report.");
      }
      setReport(body as Edi837BatchReport);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load batch report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void loadReport()}
        disabled={loading}
        className={`${portalButtonSecondaryClass} px-4 py-1.5 text-xs disabled:cursor-not-allowed`}
      >
        {loading ? "Loading…" : "Review batch"}
      </button>
      {error && (
        <p className="max-w-xs text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      {open && report && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-837-batch-title"
        >
          <div className={`${portalCardClass} w-full max-w-5xl p-6 shadow-xl`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2
                  id="review-837-batch-title"
                  className="font-serif text-2xl font-semibold text-primary-dark"
                >
                  837 batch report
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {periodLabel} · {report.invoiceCount} invoice
                  {report.invoiceCount === 1 ? "" : "s"} · L&I bill total{" "}
                  {formatCurrency(report.totalLniBillAmount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`${portalButtonSecondaryClass} shrink-0`}
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  report.canGenerate
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-red-100 text-red-900"
                }`}
              >
                {report.canGenerate ? "Ready to generate" : `${report.blockerCount} blocker(s)`}
              </span>
              {report.warningCount > 0 && (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-950">
                  {report.warningCount} warning{report.warningCount === 1 ? "" : "s"}
                </span>
              )}
              {report.submittedCount > 0 && (
                <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary-dark">
                  {report.submittedCount} will become Billed
                </span>
              )}
            </div>

            {!report.canGenerate && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
                Fix blockers before generating. Generating marks matched invoices Billed and assigns
                CLM numbers.
              </p>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">Claim</th>
                    <th className="py-2 pr-4">Therapist</th>
                    <th className="py-2 pr-4">CLM</th>
                    <th className="py-2 pr-4 text-right">L&I bill</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invoices.map((row) => (
                    <tr key={row.invoiceId} className="border-b border-border/70 align-top">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/portal/admin/invoices/${row.invoiceId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          #{row.invoiceNumber}
                        </Link>
                        <p className="text-xs text-muted">{row.clientName}</p>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{row.claimNumber}</td>
                      <td className="py-3 pr-4">{row.therapistName}</td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {row.clmControlNumber ?? (
                          <span className="text-muted">{row.clmNote}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {formatCurrency(row.lniBillAmount)}
                      </td>
                      <td className="py-3 pr-4 text-xs">{row.status}</td>
                      <td className="py-3">
                        {row.blockers.length === 0 && row.warnings.length === 0 ? (
                          <span className="text-xs text-emerald-800">OK</span>
                        ) : (
                          <ul className="space-y-1 text-xs">
                            {row.blockers.map((issue) => (
                              <li key={issue} className="text-red-800">
                                {issue}
                              </li>
                            ))}
                            {row.warnings.map((issue) => (
                              <li key={issue} className="text-amber-900">
                                {issue}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Generate837Form
                payPeriodId={payPeriodId}
                periodLabel={periodLabel}
                usageIndicator={usageIndicator}
                disabled={!report.canGenerate}
              />
              <p className="text-xs text-muted">
                ISA usage: {usageIndicator === "P" ? "Production (P)" : "Test (T)"}. Each generate is
                logged with control numbers and a file hash.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
