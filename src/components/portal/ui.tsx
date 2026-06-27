export const portalInputClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

export const portalLabelClass = "mb-1.5 block text-sm font-medium text-foreground";

export const portalButtonClass =
  "rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60";

export const portalButtonSecondaryClass =
  "rounded-full border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground transition hover:bg-primary/5 disabled:opacity-60";

export const portalCardClass = "rounded-2xl border border-border bg-surface p-6 shadow-sm";

export const portalCardCompactClass = "rounded-xl border border-border bg-surface p-4 shadow-sm";

export const portalInputCompactClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

export const portalLabelCompactClass = "mb-0.5 block text-xs font-medium text-muted";

export const portalFormGridClass = "grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3";

export const portalSectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wide text-muted";

export const statusBadge: Record<string, string> = {
  DRAFT: "bg-muted/15 text-muted",
  SUBMITTED: "bg-amber-100 text-amber-900",
  BILLED: "bg-primary/10 text-primary-dark",
  READY: "bg-primary/10 text-primary-dark",
  UNASSIGNED: "bg-slate-100 text-slate-800",
  PENDING_THERAPIST: "bg-amber-100 text-amber-900",
  ACTIVE: "bg-primary/10 text-primary-dark",
  REJECTED_BY_ADMIN: "bg-red-100 text-red-800",
  CLOSED: "bg-slate-200 text-slate-800",
};

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    UNASSIGNED: "Unassigned",
    PENDING_THERAPIST: "Pending therapist",
    REJECTED_BY_ADMIN: "Rejected",
    CLOSED: "Closed",
  };
  const label = labels[status] ?? status.toLowerCase().replace(/_/g, " ");
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadge[status] ?? "bg-muted/15 text-muted"}`}
    >
      {label}
    </span>
  );
}
