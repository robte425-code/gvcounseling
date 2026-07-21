import { formatCurrency, formatDate } from "@/lib/constants";
import { listRecentEdi837Submissions } from "@/lib/edi837-submission";
import { portalCardClass, portalSectionHeadingClass } from "@/components/portal/ui";

export async function Billing837SubmissionHistory() {
  const submissions = await listRecentEdi837Submissions(20);

  return (
    <section id="billing-history" className={`${portalCardClass} scroll-mt-16`}>
      <p className={portalSectionHeadingClass}>Submission history</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">837 audit log</h2>
      <p className="mt-1 text-xs text-muted">
        Each generate records ISA/GS control numbers, claim count, L&I total, invoice CLMs, and a
        SHA-256 hash of the downloaded file. The EDI file itself is not stored.
      </p>

      {submissions.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No 837 files generated yet.</p>
      ) : (
        <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto overscroll-contain pr-1">
          {submissions.map((submission) => {
            const periodLabel =
              submission.payPeriod.label ?? formatDate(submission.payPeriod.cutoffDate);
            const adminName = `${submission.generatedBy.firstName} ${submission.generatedBy.lastName}`;
            return (
              <li
                key={submission.id}
                className="rounded-xl border border-border bg-primary/[0.02] px-4 py-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-primary-dark">
                      {periodLabel} · {submission.filename}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDate(submission.generatedAt)} · {adminName} · ISA{" "}
                      {submission.isaUsageIndicator} · {submission.claimCount} claim
                      {submission.claimCount === 1 ? "" : "s"} ·{" "}
                      {formatCurrency(Number(submission.totalAmount))}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      ISA {submission.isaControl} · GS {submission.gsControl} · SHA-256{" "}
                      {submission.contentSha256.slice(0, 12)}…
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
