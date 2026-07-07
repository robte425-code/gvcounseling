import Link from "next/link";
import { requireAdmin } from "@/auth";
import { RemittanceImportForm, DeleteRemittancePreviewForm } from "@/components/portal/RemittancePayPanel";
import { portalCardClass, portalSectionHeadingClass, StatusBadge } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import {
  countUnresolvedRemittanceLines,
  summarizeRemittanceBillCounts,
} from "@/lib/remittance-line-supersede";
import { prisma } from "@/lib/prisma";

function RemittanceBillCountSummary({
  paid,
  denied,
  inProcess,
  superseded,
  unresolved,
}: {
  paid: number;
  denied: number;
  inProcess: number;
  superseded: number;
  unresolved: number;
}) {
  const items: Array<
    | { key: string; kind: "status"; status: string; count: number }
    | { key: string; kind: "label"; label: string; className: string; count: number }
  > = [];
  if (paid > 0) items.push({ key: "paid", kind: "status", status: "PAID", count: paid });
  if (denied > 0) items.push({ key: "denied", kind: "status", status: "DENIED", count: denied });
  if (inProcess > 0) {
    items.push({ key: "in-process", kind: "status", status: "IN_PROCESS", count: inProcess });
  }
  if (superseded > 0) {
    items.push({
      key: "superseded",
      kind: "label",
      label: "Superseded",
      className: "bg-slate-100 text-slate-700",
      count: superseded,
    });
  }
  if (unresolved > 0) {
    items.push({
      key: "unresolved",
      kind: "label",
      label: "Unresolved",
      className: "bg-red-100 text-red-800",
      count: unresolved,
    });
  }

  if (items.length === 0) return null;

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1">
          {item.kind === "status" ? (
            <StatusBadge status={item.status} />
          ) : (
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${item.className}`}
            >
              {item.label}
            </span>
          )}
          <span className="text-xs tabular-nums text-muted">{item.count}</span>
        </span>
      ))}
    </p>
  );
}

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; imported?: string; failed?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;

  const remittances = await prisma.remittanceAdvice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      _count: { select: { lines: true } },
      lines: { select: { matchedInvoiceId: true, supersededAt: true, section: true } },
      payRun: {
        include: {
          payouts: {
            include: { therapist: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });

  const previewUnresolved = remittances.filter(
    (remittance) =>
      remittance.status === "PREVIEW" &&
      countUnresolvedRemittanceLines(remittance.lines) > 0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Pay</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Import L&I Remittance Advice PDFs when payments arrive. Review matches, update invoice
          L&I status, and calculate therapist pay from fee schedules.
        </p>
      </div>

      {query.deleted === "1" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Preview remittance deleted. You can import the same PDF again.
        </p>
      )}

      {query.imported && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Imported {query.imported} remittance{query.imported === "1" ? "" : "s"} from LNI RAs
          {query.failed && Number(query.failed) > 0
            ? ` (${query.failed} failed — see history or retry after deleting previews)`
            : "."}
        </p>
      )}

      {previewUnresolved.length > 0 && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span className="font-semibold">
            {previewUnresolved.length} preview remittance
            {previewUnresolved.length === 1 ? "" : "s"} with unresolved bills
          </span>
          {" — "}
          every bill must match an invoice or be superseded before applying. Open each preview below
          to resolve matching issues.
        </p>
      )}

      <section className={portalCardClass}>
        <p className={portalSectionHeadingClass}>Import</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">New remittance</h2>
        <p className="mt-1 text-xs text-muted">
          Select remittance PDFs from the LNI RAs Google Drive folder, or upload files directly.
          Multiple files import oldest-to-newest by filename date.
        </p>
        <div className="mt-4">
          <RemittanceImportForm />
        </div>
      </section>

      <section className={portalCardClass}>
        <p className={portalSectionHeadingClass}>History</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">Remittances</h2>
        {remittances.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No remittances imported yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {remittances.map((remittance) => {
              const therapistTotal = remittance.payRun?.payouts.reduce(
                (sum, payout) => sum + Number(payout.therapistAmount),
                0,
              );
              const unresolvedCount = countUnresolvedRemittanceLines(remittance.lines);
              const billSummary = summarizeRemittanceBillCounts(remittance.lines);
              const hasUnresolvedPreview =
                remittance.status === "PREVIEW" && unresolvedCount > 0;
              return (
                <li
                  key={remittance.id}
                  className={`rounded-xl border p-4 transition ${
                    hasUnresolvedPreview
                      ? "border-red-300 bg-red-50/40 hover:border-red-400"
                      : "border-border bg-primary/[0.02] hover:border-primary/20"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/portal/admin/pay/${remittance.id}`} className="block min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-primary-dark">
                            RA {remittance.remittanceNumber} · {formatDate(remittance.invoiceDate)}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Warrant {remittance.warrantRegister} · {remittance._count.lines} bills ·{" "}
                            {remittance.status === "APPLIED" ? "Applied" : "Preview"}
                            {hasUnresolvedPreview && (
                              <>
                                {" · "}
                                <span className="font-medium text-red-800">
                                  {unresolvedCount} unresolved
                                </span>
                              </>
                            )}
                          </p>
                          <RemittanceBillCountSummary {...billSummary} />
                        </div>
                        <div className="text-sm">
                          <p className="font-semibold text-primary-dark">
                            L&I paid {formatCurrency(Number(remittance.totalPaid))}
                          </p>
                          {therapistTotal != null && (
                            <p className="text-xs text-muted">
                              Therapist pay {formatCurrency(therapistTotal)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                    {remittance.status === "PREVIEW" && (
                      <DeleteRemittancePreviewForm
                        remittanceAdviceId={remittance.id}
                        remittanceNumber={remittance.remittanceNumber}
                        warrantRegister={remittance.warrantRegister}
                        compact
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
