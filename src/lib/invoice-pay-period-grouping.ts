import { calendarIsoFromDate, formatCalendarIso, formatDate } from "@/lib/constants";

export type PayPeriodGroupableInvoice = {
  invoiceNumber: number;
  payPeriodId: string | null;
  payPeriodLabel: string | null;
  payPeriodSortKey: string;
  earliestServiceDate: string | null;
};

export type InvoicePayPeriodGroup<T extends PayPeriodGroupableInvoice> = {
  key: string;
  label: string;
  invoices: T[];
};

const UNASSIGNED_GROUP_KEY = "__unassigned__";

export { UNASSIGNED_GROUP_KEY };

export function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function formatInvoiceServiceDates(lineItems: { serviceDate: Date }[]): string {
  const dates = [...new Set(lineItems.map((line) => calendarIsoFromDate(line.serviceDate)))].sort();
  if (dates.length === 0) return "—";
  return dates.map((date) => formatCalendarIso(date)).join(", ");
}

export function earliestServiceDateIso(lineItems: { serviceDate: Date }[]): string | null {
  if (lineItems.length === 0) return null;
  let min = lineItems[0].serviceDate;
  for (let i = 1; i < lineItems.length; i++) {
    if (lineItems[i].serviceDate < min) min = lineItems[i].serviceDate;
  }
  return calendarIsoFromDate(min);
}

export function payPeriodSortKey(period: { cutoffDate: Date } | null | undefined): string {
  return period ? calendarIsoFromDate(period.cutoffDate) : "";
}

export function payPeriodLabel(
  period: { label: string | null; cutoffDate: Date } | null,
): string | null {
  if (!period) return null;
  return period.label ?? formatDate(period.cutoffDate);
}

export function groupInvoicesByPayPeriod<T extends PayPeriodGroupableInvoice>(
  invoices: T[],
): InvoicePayPeriodGroup<T>[] {
  const byPeriod = new Map<string, T[]>();

  for (const inv of invoices) {
    const key = inv.payPeriodId ?? UNASSIGNED_GROUP_KEY;
    const group = byPeriod.get(key);
    if (group) group.push(inv);
    else byPeriod.set(key, [inv]);
  }

  return [...byPeriod.entries()]
    .map(([key, items]) => ({
      key,
      label: items[0]?.payPeriodLabel ?? "Unassigned",
      payPeriodSortKey: items[0]?.payPeriodSortKey ?? "",
      invoices: [...items].sort((a, b) => {
        const dateCompare = (a.earliestServiceDate ?? "").localeCompare(b.earliestServiceDate ?? "");
        if (dateCompare !== 0) return dateCompare;
        return a.invoiceNumber - b.invoiceNumber;
      }),
    }))
    .sort((a, b) => {
      if (a.key === UNASSIGNED_GROUP_KEY) return -1;
      if (b.key === UNASSIGNED_GROUP_KEY) return 1;
      return b.payPeriodSortKey.localeCompare(a.payPeriodSortKey);
    })
    .map(({ key, label, invoices: groupInvoices }) => ({
      key,
      label,
      invoices: groupInvoices,
    }));
}
