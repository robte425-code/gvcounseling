export const portalInputClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

export const portalLabelClass = "mb-1.5 block text-sm font-medium text-foreground";

export const portalButtonClass =
  "rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60";

export const portalButtonSecondaryClass =
  "rounded-full border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground transition hover:bg-primary/5 disabled:opacity-60";

export const portalCardClass = "rounded-2xl border border-border bg-surface p-6 shadow-sm";

export const statusBadge: Record<string, string> = {
  DRAFT: "bg-muted/15 text-muted",
  SUBMITTED: "bg-amber-100 text-amber-900",
  BILLED: "bg-primary/10 text-primary-dark",
  READY: "bg-primary/10 text-primary-dark",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadge[status] ?? "bg-muted/15 text-muted"}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
