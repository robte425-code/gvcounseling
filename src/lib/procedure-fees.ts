import { PROCEDURE_CODES } from "@/lib/constants";
import {
  dayBefore,
  getCurrentProcedureFeeFromSchedule,
  resolveFeeAmount,
  toDateOnly,
  type FeeScheduleRow,
} from "@/lib/procedure-fee-schedule";
import { prisma } from "@/lib/prisma";

export {
  dayBefore,
  getCurrentProcedureFeeFromSchedule,
  resolveFeeAmount,
  toDateOnly,
  type FeeScheduleRow,
} from "@/lib/procedure-fee-schedule";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function isKnownProcedureCode(code: string): boolean {
  return PROCEDURE_CODES.some((entry) => entry.code === code);
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

async function upsertFeeSchedule(
  tx: TransactionClient,
  scope: { therapistId?: string },
  options: {
    procedureCode: string;
    amount: number;
    effectiveFrom: Date;
    createdById?: string;
  },
) {
  const { procedureCode, amount, effectiveFrom, createdById } = options;
  const from = toDateOnly(effectiveFrom);
  const scopeWhere = scope.therapistId ? { therapistId: scope.therapistId, procedureCode } : { procedureCode };

  const overlapping = scope.therapistId
    ? await tx.therapistProcedureCodeFee.findMany({
        where: {
          ...scopeWhere,
          effectiveFrom: { lt: from },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
      })
    : await tx.procedureCodeFee.findMany({
        where: {
          ...scopeWhere,
          effectiveFrom: { lt: from },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
      });

  for (const fee of overlapping) {
    if (scope.therapistId) {
      await tx.therapistProcedureCodeFee.update({
        where: { id: fee.id },
        data: { effectiveTo: dayBefore(from) },
      });
    } else {
      await tx.procedureCodeFee.update({
        where: { id: fee.id },
        data: { effectiveTo: dayBefore(from) },
      });
    }
  }

  const nextFee = scope.therapistId
    ? await tx.therapistProcedureCodeFee.findFirst({
        where: {
          therapistId: scope.therapistId,
          procedureCode,
          effectiveFrom: { gt: from },
        },
        orderBy: { effectiveFrom: "asc" },
      })
    : await tx.procedureCodeFee.findFirst({
        where: {
          procedureCode,
          effectiveFrom: { gt: from },
        },
        orderBy: { effectiveFrom: "asc" },
      });

  const effectiveTo = nextFee ? dayBefore(toDateOnly(nextFee.effectiveFrom)) : null;

  if (scope.therapistId) {
    await tx.therapistProcedureCodeFee.upsert({
      where: {
        therapistId_procedureCode_effectiveFrom: {
          therapistId: scope.therapistId,
          procedureCode,
          effectiveFrom: from,
        },
      },
      create: {
        therapistId: scope.therapistId,
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
  } else {
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
  }
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
    await upsertFeeSchedule(tx, {}, { procedureCode, amount, effectiveFrom: from, createdById });
  });
}

export async function loadTherapistProcedureCodeFees(therapistId: string) {
  return prisma.therapistProcedureCodeFee.findMany({
    where: { therapistId },
    orderBy: [{ procedureCode: "asc" }, { effectiveFrom: "desc" }],
  });
}

export async function createTherapistProcedureCodeFee(options: {
  therapistId: string;
  procedureCode: string;
  amount: number;
  effectiveFrom: Date;
  createdById?: string;
}) {
  const { therapistId, procedureCode, amount, effectiveFrom, createdById } = options;
  if (!isKnownProcedureCode(procedureCode)) {
    throw new Error("Unknown procedure code.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Fee amount must be greater than zero.");
  }

  const therapist = await prisma.user.findFirst({
    where: { id: therapistId, role: "THERAPIST" },
    select: { id: true },
  });
  if (!therapist) throw new Error("Therapist not found.");

  const from = toDateOnly(effectiveFrom);

  await prisma.$transaction(async (tx) => {
    await upsertFeeSchedule(tx, { therapistId }, { procedureCode, amount, effectiveFrom: from, createdById });
  });
}

export function buildFeeLookup(fees: FeeScheduleRow[]) {
  return (procedureCode: string, serviceDate: Date) =>
    resolveFeeAmount(fees, procedureCode, serviceDate);
}

export function serializeFeeSchedule(
  fees: {
    procedureCode: string;
    amount: unknown;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }[],
): FeeScheduleRow[] {
  return fees.map((fee) => ({
    procedureCode: fee.procedureCode,
    amount: Number(fee.amount),
    effectiveFrom: fee.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: fee.effectiveTo ? fee.effectiveTo.toISOString().slice(0, 10) : null,
  }));
}

export async function applyTherapistFeeSchedule(
  therapistId: string,
  lines: { serviceDate: Date; procedureCode: string; sortOrder: number }[],
) {
  const fees = await loadTherapistProcedureCodeFees(therapistId);
  return lines.map((line) => {
    const amount = resolveFeeAmount(fees, line.procedureCode, line.serviceDate);
    if (amount === null) {
      throw new Error(
        `No fee on file for ${line.procedureCode} on ${line.serviceDate.toISOString().slice(0, 10)}. Ask admin to set your procedure code fees.`,
      );
    }
    return { ...line, amount };
  });
}
