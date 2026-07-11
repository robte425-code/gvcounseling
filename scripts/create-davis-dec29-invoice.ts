/**
 * Create missing BH00259 (Eddie Davis) invoice for 2025-12-29 session.
 * L&I RA 53703 paid this date but no portal invoice existed.
 *
 * Usage:
 *   npx tsx scripts/create-davis-dec29-invoice.ts        # dry run
 *   npx tsx scripts/create-davis-dec29-invoice.ts --fix  # create invoice
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const CLAIM = "BH00259";
const SERVICE_DATE_ISO = "2025-12-29";
const BILLED_AT_ISO = "2026-01-02";
const PAY_PERIOD_ID = "cmqqps2w4000204kw3mczkm2m"; // Jan 2, 2026 cutoff

const LINE_ITEMS = [
  { procedureCode: "96158", amount: 42.5, units: 1 },
  { procedureCode: "96159", amount: 21.25, units: 1 },
  { procedureCode: "96159", amount: 21.25, units: 1 },
] as const;

async function main() {
  const fix = process.argv.includes("--fix");
  const { prisma } = await import("../src/lib/prisma");
  const { getNextInvoiceNumber } = await import("../src/lib/invoice-numbers");

  const client = await prisma.client.findFirst({
    where: { lniClaimNumber: CLAIM },
    include: { therapist: { select: { id: true, firstName: true, lastName: true, lniProviderId: true } } },
  });
  if (!client) throw new Error(`Client ${CLAIM} not found.`);

  const serviceDate = new Date(`${SERVICE_DATE_ISO}T00:00:00.000Z`);
  const billedAt = new Date(`${BILLED_AT_ISO}T08:00:00.000Z`);

  const existing = await prisma.invoice.findFirst({
    where: {
      clientId: client.id,
      status: "BILLED",
      lineItems: { some: { serviceDate } },
    },
    include: { lineItems: true },
  });

  if (existing) {
    console.log(
      `Invoice already exists: #${existing.invoiceNumber} (${existing.lineItems.map((l) => l.procedureCode).join(", ")})`,
    );
    await prisma.$disconnect();
    return;
  }

  const nextNumber = await getNextInvoiceNumber(prisma, client.therapistId);
  const totalAmount = LINE_ITEMS.reduce((sum, line) => sum + line.amount, 0);

  console.log(`Client: ${client.firstName} ${client.lastName} (${CLAIM})`);
  console.log(`Therapist: ${client.therapist.firstName} ${client.therapist.lastName}`);
  console.log(`Service date: ${SERVICE_DATE_ISO}`);
  console.log(`Invoice #: ${nextNumber}`);
  console.log(`Line items: ${LINE_ITEMS.map((l) => `${l.procedureCode} $${l.amount}`).join(", ")}`);
  console.log(`Total: $${totalAmount.toFixed(2)}`);
  console.log(`Status: BILLED (payment status unset until RA apply)`);

  if (!fix) {
    console.log("\nDry run. Re-run with --fix to create the invoice.");
    await prisma.$disconnect();
    return;
  }

  const invoice = await prisma.invoice.create({
    data: {
      therapistId: client.therapistId,
      clientId: client.id,
      invoiceNumber: nextNumber,
      totalAmount,
      status: "BILLED",
      paymentStatus: null,
      payPeriodId: PAY_PERIOD_ID,
      billedAt,
      submittedAt: billedAt,
      lineItems: {
        create: LINE_ITEMS.map((line, sortOrder) => ({
          serviceDate,
          procedureCode: line.procedureCode,
          amount: line.amount,
          units: line.units,
          sortOrder,
        })),
      },
    },
    include: { lineItems: true },
  });

  console.log(`\nCreated invoice #${invoice.invoiceNumber} (${invoice.id})`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
