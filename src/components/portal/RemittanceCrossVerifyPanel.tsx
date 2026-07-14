import Link from "next/link";
import type { RemittanceCrossVerifyResult } from "@/lib/remittance-cross-verify";
import { remittanceSourceFormatLabel } from "@/lib/remittance-file-format";

type Props = {
  verify: RemittanceCrossVerifyResult;
  compact?: boolean;
};

export function RemittanceCrossVerifyBadge({ verify, compact = false }: Props) {
  if (verify.status === "missing_counterpart") {
    const label = verify.counterpartFormat
      ? `No ${remittanceSourceFormatLabel(verify.counterpartFormat)}`
      : "No counterpart";
    return (
      <span
        className={`inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-slate-700 ${
          compact ? "" : "mt-1.5"
        }`}
      >
        {label}
      </span>
    );
  }

  if (verify.status === "matched") {
    return (
      <span
        className={`inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-emerald-900 ${
          compact ? "" : "mt-1.5"
        }`}
      >
        PDF ↔ 835 match
      </span>
    );
  }

  return (
    <span
      className={`inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-amber-950 ${
        compact ? "" : "mt-1.5"
      }`}
    >
      PDF ↔ 835 mismatch ({verify.issues.length})
    </span>
  );
}

type PanelProps = {
  verify: RemittanceCrossVerifyResult;
  currentSourceLabel: string;
};

export function RemittanceCrossVerifyPanel({ verify, currentSourceLabel }: PanelProps) {
  if (verify.status === "missing_counterpart") {
    const missingLabel = verify.counterpartFormat
      ? remittanceSourceFormatLabel(verify.counterpartFormat)
      : "counterpart";
    return (
      <div className="rounded-xl border border-border bg-primary/[0.03] px-4 py-3">
        <p className="text-sm font-medium text-primary-dark">PDF ↔ 835 verification</p>
        <p className="mt-1 text-sm text-muted">
          This {currentSourceLabel} has no imported {missingLabel} yet. Import the other format to
          cross-check totals, bill counts, and line amounts before applying.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        verify.status === "matched"
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-amber-300 bg-amber-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-primary-dark">PDF ↔ 835 verification</p>
        <RemittanceCrossVerifyBadge verify={verify} compact />
        {verify.counterpartId && (
          <Link href={`/portal/admin/pay/${verify.counterpartId}`} className="text-xs text-primary hover:underline">
            Open counterpart
          </Link>
        )}
      </div>
      {verify.status === "matched" ? (
        <p className="mt-2 text-sm text-muted">
          Totals, bill counts, payable amounts, and service lines match between the PDF RA and 835
          ERA.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-amber-950">
          {verify.issues.map((issue) => (
            <li key={`${issue.kind}-${issue.message}`}>• {issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
