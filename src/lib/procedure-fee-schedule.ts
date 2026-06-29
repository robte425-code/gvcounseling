export type FeeScheduleRow = {
  procedureCode: string;
  amount: unknown;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
};

/** Normalize to UTC midnight for date-only fee comparisons. */
export function toDateOnly(value: Date | string): Date {
  const text = typeof value === "string" ? value : value.toISOString().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error("Invalid date.");
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

export function dayBefore(date: Date): Date {
  const previous = new Date(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

export function resolveFeeAmount(
  fees: FeeScheduleRow[],
  procedureCode: string,
  serviceDate: Date | string,
): number | null {
  const date = toDateOnly(serviceDate);
  let bestAmount: number | null = null;
  let bestFrom: Date | null = null;

  for (const fee of fees) {
    if (fee.procedureCode !== procedureCode) continue;
    const from = toDateOnly(fee.effectiveFrom);
    if (from > date) continue;
    if (fee.effectiveTo && toDateOnly(fee.effectiveTo) < date) continue;
    if (!bestFrom || from > bestFrom) {
      bestFrom = from;
      bestAmount = Number(fee.amount);
    }
  }

  return bestAmount;
}

export function getCurrentProcedureFeeFromSchedule(
  fees: FeeScheduleRow[],
  procedureCode: string,
  asOf: Date | string = new Date(),
) {
  const amount = resolveFeeAmount(fees, procedureCode, asOf);
  if (amount === null) return null;

  const date = toDateOnly(asOf);
  const active = fees
    .filter((fee) => {
      if (fee.procedureCode !== procedureCode) return false;
      const from = toDateOnly(fee.effectiveFrom);
      if (from > date) return false;
      if (fee.effectiveTo && toDateOnly(fee.effectiveTo) < date) return false;
      return true;
    })
    .sort((a, b) => toDateOnly(b.effectiveFrom).getTime() - toDateOnly(a.effectiveFrom).getTime())[0];

  return active ? { amount, effectiveFrom: active.effectiveFrom } : null;
}

export function getCurrentProcedureFeeRecordFromSchedule(
  fees: (FeeScheduleRow & { id?: string })[],
  procedureCode: string,
  asOf: Date | string = new Date(),
) {
  const amount = resolveFeeAmount(fees, procedureCode, asOf);
  if (amount === null) return null;

  const date = toDateOnly(asOf);
  const active = fees
    .filter((fee) => {
      if (fee.procedureCode !== procedureCode) return false;
      const from = toDateOnly(fee.effectiveFrom);
      if (from > date) return false;
      if (fee.effectiveTo && toDateOnly(fee.effectiveTo) < date) return false;
      return true;
    })
    .sort((a, b) => toDateOnly(b.effectiveFrom).getTime() - toDateOnly(a.effectiveFrom).getTime())[0];

  if (!active?.id) return null;

  return {
    id: active.id,
    amount,
    effectiveFrom: active.effectiveFrom,
  };
}
