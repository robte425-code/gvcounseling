import { PROCEDURE_CODES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export function isKnownProcedureCode(code: string): boolean {
  return PROCEDURE_CODES.some((entry) => entry.code === code);
}

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
  fees: { procedureCode: string; amount: unknown; effectiveFrom: Date; effectiveTo: Date | null }[],
  procedureCode: string,
  serviceDate: Date,
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

export async function loadAllProcedureCodeFees() {
  return prisma.procedureCodeFee.findMany({
    orderBy: [{ procedureCode: "asc" }, { effectiveFrom: "desc" }],
  });
}

export async function getCurrentProcedureFee(procedureCode: string, asOf = new Date()) {
  const fees = await loadAllProcedureCodeFees();
  return getCurrentProcedureFeeFromSchedule(fees, procedureCode, asOf);
}

export function getCurrentProcedureFeeFromSchedule(
  fees: { procedureCode: string; amount: unknown; effectiveFrom: Date; effectiveTo: Date | null }[],
  procedureCode: string,
  asOf = new Date(),
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

export async function createProcedureCodeFee(options: {
  procedureCode: string;
  amount: number;
  effectiveFrom: Date;
  createdById?: string;
}) {
  const { procedureCode, amount, effectiveFrom, createdById } = options;
  if (!isKnownProcedureCode(procedureCode)) {
    throw new Error("Unknown procedure code.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Fee amount must be greater than zero.");
  }

  const from = toDateOnly(effectiveFrom);

  await prisma.$transaction(async (tx) => {
    const overlapping = await tx.procedureCodeFee.findMany({
      where: {
        procedureCode,
        effectiveFrom: { lt: from },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
    });

    for (const fee of overlapping) {
      await tx.procedureCodeFee.update({
        where: { id: fee.id },
        data: { effectiveTo: dayBefore(from) },
      });
    }

    const nextFee = await tx.procedureCodeFee.findFirst({
      where: {
        procedureCode,
        effectiveFrom: { gt: from },
      },
      orderBy: { effectiveFrom: "asc" },
    });

    const effectiveTo = nextFee ? dayBefore(toDateOnly(nextFee.effectiveFrom)) : null;

    await tx.procedureCodeFee.upsert({
      where: {
        procedureCode_effectiveFrom: {
          procedureCode,
          effectiveFrom: from,
        },
      },
      create: {
        procedureCode,
        amount,
        effectiveFrom: from,
        effectiveTo,
        createdById,
      },
      update: {
        amount,
        effectiveTo,
        createdById,
      },
    });
  });
}

export function buildFeeLookup(
  fees: { procedureCode: string; amount: unknown; effectiveFrom: Date; effectiveTo: Date | null }[],
) {
  return (procedureCode: string, serviceDate: Date) =>
    resolveFeeAmount(fees, procedureCode, serviceDate);
}
