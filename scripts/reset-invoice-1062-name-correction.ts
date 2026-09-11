/**
 * One-shot: L&I rejected invoice #1062 (claim BF12726) because the client's last
 * name was wrong. The name has since been corrected, so return the invoice from
 * Billed to Submitted and let it go out on a regenerated 837.
 *
 * Keeps payPeriodId and clmControlNumber, so the corrected claim reaches L&I as a
 * correction to the same CLM rather than a new one — the generator reuses an
 * existing clmControlNumber when present.
 *
 * paymentStatus is deliberately left as-is (IN_PROCESS from the rejecting RA).
 * The 837 does not read it, and the next remittance reconciles it.
 *
 * Manual:
 *   FORCE_RESET_INVOICE_1062=1 npx tsx scripts/reset-invoice-1062-name-correction.ts
 */
import "dotenv/config";

const INVOICE_NUMBER = 1062;
const CLAIM_NUMBER = "BF12726";
const DONE_KEY = "reset_invoice_1062_name_correction_done";
const REPORT_KEY = "reset_invoice_1062_name_correction_report";
const NOTE_BODY =
  "Admin reset: workflow status returned from Billed → Submitted after L&I rejected the claim for an incorrect client last name (EOB 140). " +
  "The client record has been corrected; regenerate the 837 for the Aug 28, 2026 pay period to resubmit under the same CLM.";

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("reset-invoice-1062: DATABASE_URL not set — skipping");
    return;
  }

  const force = process.env.FORCE_RESET_INVOICE_1062 === "1";
  if (!force) {
    const done = await prisma.portalSetting.findUnique({ where: { key: DONE_KEY } });
    if (done) {
      console.log("reset-invoice-1062: already completed — skipping");
      await prisma.$disconnect();
      return;
    }
  }

  // Scoped by claim as well as number: invoice numbers are unique per therapist,
  // not globally, so the number alone could match another therapist's invoice.
  const invoice = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: INVOICE_NUMBER,
      client: { lniClaimNumber: CLAIM_NUMBER },
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      paymentStatus: true,
      billedAt: true,
      payPeriodId: true,
      clmControlNumber: true,
      totalAmount: true,
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      payPeriod: { select: { label: true } },
      payRunLines: { select: { id: true } },
    },
  });

  if (!invoice) {
    console.log(`reset-invoice-1062: no invoice #${INVOICE_NUMBER} for claim ${CLAIM_NUMBER}`);
    await prisma.$disconnect();
    return;
  }

  const label = `#${invoice.invoiceNumber} ${invoice.client.lastName}, ${invoice.client.firstName} (${invoice.client.lniClaimNumber})`;
  console.log(`before: ${label}`);
  console.log(`  status=${invoice.status} paymentStatus=${invoice.paymentStatus}`);
  console.log(`  billedAt=${invoice.billedAt?.toISOString() ?? "—"} clm=${invoice.clmControlNumber ?? "—"}`);
  console.log(`  payPeriod=${invoice.payPeriod?.label ?? "none"} total=$${Number(invoice.totalAmount).toFixed(2)}`);

  // Guards: never touch a claim L&I has paid, and never re-bill one the therapist
  // has already been paid for.
  if (invoice.paymentStatus === "PAID") {
    console.log("refusing: invoice is PAID — resubmitting would double-bill L&I.");
    await prisma.$disconnect();
    return;
  }
  if (invoice.payRunLines.length > 0) {
    console.log(
      `refusing: invoice already has ${invoice.payRunLines.length} therapist pay-run line(s) — resolve the payout first.`,
    );
    await prisma.$disconnect();
    return;
  }
  if (invoice.status !== "BILLED") {
    console.log(`nothing to do: status is ${invoice.status}, not BILLED.`);
    await prisma.$disconnect();
    return;
  }

  const admin =
    (await prisma.user.findFirst({
      where: { email: "ghim@gvcounseling.com", role: "ADMIN" },
      select: { id: true },
    })) ?? (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }));

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SUBMITTED", billedAt: null },
    }),
    ...(admin
      ? [
          prisma.invoiceNote.create({
            data: { invoiceId: invoice.id, authorId: admin.id, body: NOTE_BODY },
          }),
        ]
      : []),
  ]);

  const after = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    select: {
      status: true,
      billedAt: true,
      paymentStatus: true,
      payPeriodId: true,
      clmControlNumber: true,
    },
  });

  console.log(`after:  status=${after!.status} billedAt=${after!.billedAt?.toISOString() ?? "—"}`);
  console.log(`  paymentStatus=${after!.paymentStatus} (unchanged — the next RA reconciles it)`);
  console.log(`  payPeriodId=${after!.payPeriodId} clm=${after!.clmControlNumber}`);
  console.log(`  invoice note added: ${admin ? "yes" : "no admin found"}`);

  const report = [
    `reset ${label}`,
    `  BILLED → SUBMITTED at ${new Date().toISOString()}`,
    `  clm preserved: ${after!.clmControlNumber}`,
  ].join("\n");

  await prisma.portalSetting.upsert({
    where: { key: REPORT_KEY },
    create: { key: REPORT_KEY, value: report },
    update: { value: report },
  });
  await prisma.portalSetting.upsert({
    where: { key: DONE_KEY },
    create: { key: DONE_KEY, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });

  console.log("\nNext: regenerate the 837 for the Aug 28, 2026 pay period on Bill L&I.");

  await prisma.$disconnect();
}

main();
