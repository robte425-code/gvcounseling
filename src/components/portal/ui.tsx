import type { PaymentStatus } from "@/generated/prisma/client";
import { paymentStatusLabel } from "@/lib/invoice-payment-status";

export const portalInputClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

export const portalLabelClass = "mb-1.5 block text-sm font-medium text-foreground";

export const portalButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60";

export const portalButtonSecondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground transition hover:bg-primary/5 disabled:opacity-60";

export const portalNavLinkClass =
  "inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-sm font-normal text-muted transition hover:bg-primary/10 hover:text-primary-dark lg:min-h-0";

export const portalPageTitleClass = "font-serif text-2xl font-semibold text-primary-dark sm:text-3xl";

export const portalTableScrollClass = "overflow-x-auto";

export const portalTableClass = "w-full min-w-[44rem] text-left text-sm";

export const portalTableWideClass = "w-full min-w-[52rem] text-left text-sm";

export const portalTableNarrowClass = "w-full min-w-[32rem] text-left text-sm";

export const portalNavButtonClass = `${portalNavLinkClass} border-0 bg-transparent cursor-pointer`;

export const portalNavSelectClass =
  "rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-normal text-muted outline-none transition hover:bg-primary/5 focus:border-primary focus:ring-2 focus:ring-primary/20";

export const portalCardClass = "rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6";

export const portalCardCompactClass = "rounded-xl border border-border bg-surface p-3 shadow-sm sm:p-4";

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
  PAID: "bg-emerald-100 text-emerald-900",
  DENIED: "bg-red-100 text-red-800",
  IN_PROCESS: "bg-amber-100 text-amber-900",
  UNPAID: "bg-slate-100 text-slate-800",
  APPEAL_IN_PROGRESS: "bg-sky-100 text-sky-900",
  UNASSIGNED: "bg-slate-100 text-slate-800",
  PENDING_THERAPIST: "bg-amber-100 text-amber-900",
  ACTIVE: "bg-primary/10 text-primary-dark",
  INACTIVE: "bg-slate-200 text-slate-600",
  REJECTED_BY_ADMIN: "bg-red-100 text-red-800",
  CLOSED: "bg-slate-200 text-slate-800",
};

const statusLabels: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  PENDING_THERAPIST: "Pending therapist",
  ACTIVE: "Active",
  REJECTED_BY_ADMIN: "Rejected",
  CLOSED: "Closed",
  INACTIVE: "Inactive",
};

function badgeLabel(status: string): string {
  switch (status) {
    case "PAID":
    case "DENIED":
    case "IN_PROCESS":
    case "UNPAID":
    case "APPEAL_IN_PROGRESS":
      return paymentStatusLabel(status as PaymentStatus);
    default:
      return statusLabels[status] ?? status.toLowerCase().replace(/_/g, " ");
  }
}

export function StatusBadge({ status }: { status: string }) {
  const label = badgeLabel(status);
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${statusBadge[status] ?? "bg-muted/15 text-muted"}`}
    >
      {label}
    </span>
  );
}
