/** Melio bill / vendor CSV helpers for therapist pay runs (SMB Melio accounts). */

export type MelioBillRow = {
  companyName: string;
  amount: number;
  invoiceNumber: string;
  dueDate: string; // MM/DD/YYYY for Melio column mapping
  note?: string;
};

export type MelioVendorRow = {
  companyName: string;
  email: string;
};

/** Escape a CSV field (RFC-style quotes when needed). */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatMelioDueDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/** Melio Bills import maps: Company name, Amount, Invoice #, Due date. */
export function buildMelioBillsCsv(rows: MelioBillRow[]): string {
  const header = ["Company name", "Amount", "Invoice #", "Due date", "Note"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        escapeCsvField(row.companyName),
        row.amount.toFixed(2),
        escapeCsvField(row.invoiceNumber),
        escapeCsvField(row.dueDate),
        escapeCsvField(row.note ?? ""),
      ].join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** Vendor list for Melio Import Vendors (Company name + Email). */
export function buildMelioVendorsCsv(rows: MelioVendorRow[]): string {
  const header = ["Company name", "Email"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [escapeCsvField(row.companyName), escapeCsvField(row.email)].join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Stable Melio invoice # for a therapist payout on a remittance.
 * Melio uses this for reconciliation; keep it short and unique per payout.
 */
export function melioInvoiceNumberForPayout(options: {
  remittanceNumber: string;
  payoutId: string;
}): string {
  const rem = options.remittanceNumber.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const shortId = options.payoutId.slice(-8).toUpperCase();
  return `GVC-${rem || "RA"}-${shortId}`;
}

export function melioVendorDisplayName(therapist: {
  melioVendorName: string | null;
  firstName: string;
  lastName: string;
}): string {
  const custom = therapist.melioVendorName?.trim();
  if (custom) return custom;
  return `${therapist.firstName} ${therapist.lastName}`.trim();
}

export function defaultMelioDueDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 3);
  return d;
}

const MELIO_INBOX_PATTERN = /^[^\s@]+@invoicesmelio\.com$/i;

export function normalizeMelioBillsInboxEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) return null;
  if (!MELIO_INBOX_PATTERN.test(trimmed)) {
    throw new Error(
      "Melio bills inbox must look like your-business@invoicesmelio.com (from Melio → Settings).",
    );
  }
  return trimmed;
}
