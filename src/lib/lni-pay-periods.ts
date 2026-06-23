export const LNI_PAYMENT_STATUS_URL =
  "https://lni.wa.gov/patient-care/billing-payments/payment-status";

export type LniPayPeriodRow = {
  cutoffDate: Date;
  paymentDate: Date;
  mars: string | null;
  label: string;
};

function stripCell(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

/** Parse MM-DD-YY from L&I table cells (may include notes like "06-23-26 (Holiday...)"). */
export function parseLniDate(raw: string): Date | null {
  const match = raw.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  year += year >= 70 ? 1900 : 2000;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function parseLniPaymentScheduleHtml(html: string): LniPayPeriodRow[] {
  const tbodyMatch = html.match(/<table[^>]*lni-c-basic-table[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch?.[1]) return [];

  const rows: LniPayPeriodRow[] = [];

  for (const rowMatch of tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      stripCell(m[1] ?? ""),
    );
    if (cells.length < 3) continue;

    const cutoffDate = parseLniDate(cells[0] ?? "");
    const paymentDate = parseLniDate(cells[2] ?? "");
    if (!cutoffDate || !paymentDate) continue;

    const mars = cells[1]?.trim() || null;
    rows.push({
      cutoffDate,
      paymentDate,
      mars,
      label: formatLabel(cutoffDate),
    });
  }

  return rows;
}

export async function fetchLniPayPeriods(): Promise<LniPayPeriodRow[]> {
  const res = await fetch(LNI_PAYMENT_STATUS_URL, {
    headers: {
      Accept: "text/html",
      "User-Agent": "GrandviewCounselingPortal/1.0",
    },
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    throw new Error(`L&I payment schedule returned ${res.status}`);
  }

  const html = await res.text();
  const rows = parseLniPaymentScheduleHtml(html);
  if (!rows.length) {
    throw new Error("Could not parse pay periods from L&I payment schedule page.");
  }

  return rows;
}
