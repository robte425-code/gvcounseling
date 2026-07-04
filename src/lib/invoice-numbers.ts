import type { PrismaClient } from "@/generated/prisma/client";

export async function getNextInvoiceNumber(
  prisma: Pick<PrismaClient, "invoice">,
  therapistId: string,
): Promise<number> {
  const last = await prisma.invoice.findFirst({
    where: { therapistId },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  return (last?.invoiceNumber ?? 0) + 1;
}
