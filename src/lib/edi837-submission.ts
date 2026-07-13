import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { Edi837Result, IsaUsageIndicator } from "@/lib/edi837";
import type { Edi837InvoiceSnapshot } from "@/lib/edi837-batch-report";
import { prisma } from "@/lib/prisma";

export function hashEdi837Content(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function recordEdi837Submission(options: {
  payPeriodId: string;
  generatedById: string;
  usageIndicator: IsaUsageIndicator;
  edi: Edi837Result;
  invoiceSnapshot: Edi837InvoiceSnapshot[];
}) {
  return prisma.edi837Submission.create({
    data: {
      payPeriodId: options.payPeriodId,
      generatedById: options.generatedById,
      isaUsageIndicator: options.usageIndicator,
      filename: options.edi.filename,
      isaControl: options.edi.isaControl,
      gsControl: options.edi.gsControl,
      claimCount: options.edi.claimCount,
      totalAmount: options.edi.totalAmount,
      contentSha256: hashEdi837Content(options.edi.content),
      invoiceSnapshot: options.invoiceSnapshot as Prisma.InputJsonValue,
    },
  });
}

export async function listRecentEdi837Submissions(limit = 25) {
  return prisma.edi837Submission.findMany({
    orderBy: { generatedAt: "desc" },
    take: limit,
    include: {
      payPeriod: { select: { label: true, cutoffDate: true } },
      generatedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

export async function listEdi837SubmissionsForPayPeriod(payPeriodId: string) {
  return prisma.edi837Submission.findMany({
    where: { payPeriodId },
    orderBy: { generatedAt: "desc" },
    include: {
      generatedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}
