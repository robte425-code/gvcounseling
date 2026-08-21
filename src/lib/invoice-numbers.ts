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

/** Prisma's unique-constraint violation. */
function isInvoiceNumberCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => field.includes("invoiceNumber"));
}

const MAX_ATTEMPTS = 5;

/**
 * Allocate the therapist's next invoice number and create the invoice, retrying
 * if someone else took that number first.
 *
 * Reading the current maximum and then inserting is a race: two invoices created
 * at once read the same number, and the unique constraint turned the loser into
 * an unhandled error that cost the therapist their draft. The constraint is what
 * makes the retry safe — the database, not this read, decides who got the number.
 *
 * Must be called with a non-transactional client: a failed insert inside an
 * interactive transaction aborts the whole transaction, so retrying there cannot work.
 */
export async function createInvoiceWithNextNumber<T>(
  prisma: Pick<PrismaClient, "invoice">,
  therapistId: string,
  create: (invoiceNumber: number) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const invoiceNumber = await getNextInvoiceNumber(prisma, therapistId);
    try {
      return await create(invoiceNumber);
    } catch (error) {
      if (!isInvoiceNumberCollision(error) || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  // Unreachable: the final attempt above either returns or throws.
  throw new Error("Could not allocate an invoice number.");
}
