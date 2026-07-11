import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { prisma } from "../src/lib/prisma";

async function checkDuplicates() {
  const lines = await prisma.remittanceAdviceLine.findMany({
    where: { claimNumber: "BJ04455", supersededAt: null },
    include: {
      remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
      matchedInvoice: { select: { invoiceNumber: true } },
    },
    orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
  });
  console.log("\nBJ04455 RA lines for 4/21/26:");
  for (const l of lines) {
    const sl = JSON.stringify(l.serviceLines);
    if (sl.includes("2026-04-21")) {
      console.log(
        l.remittanceAdvice.remittanceNumber,
        l.section,
        "inv",
        l.matchedInvoice?.invoiceNumber,
        sl.slice(0, 220),
      );
    }
  }
  const dup = await prisma.invoice.findMany({
    where: {
      client: { lniClaimNumber: "BJ04455" },
      lineItems: { some: { serviceDate: new Date("2026-04-21T12:00:00.000Z") } },
    },
    select: {
      invoiceNumber: true,
      paymentStatus: true,
      lineItems: { select: { procedureCode: true, serviceDate: true, amount: true } },
      _count: { select: { payRunLines: true } },
    },
  });
  console.log("\nInvoices with DOS 4/21/26:", JSON.stringify(dup, null, 2));
}

async function main() {
  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 956 },
    include: {
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      therapist: { select: { email: true, firstName: true, lastName: true } },
      lineItems: true,
      remittanceLines: {
        where: { supersededAt: null },
        include: {
          remittanceAdvice: {
            select: {
              remittanceNumber: true,
              invoiceDate: true,
              status: true,
              sourceFilename: true,
            },
          },
        },
        orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
      },
      payRunLines: {
        include: {
          payout: {
            include: {
              payRun: {
                include: {
                  remittanceAdvice: {
                    select: { remittanceNumber: true, sourceFilename: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!inv) {
    console.log("Invoice #956 not found");
    return;
  }

  console.log(
    JSON.stringify(
      {
        invoiceNumber: inv.invoiceNumber,
        paymentStatus: inv.paymentStatus,
        lniPaidAt: inv.lniPaidAt,
        lniEobCodes: inv.lniEobCodes,
        lniEobCodeDescriptions: inv.lniEobCodeDescriptions,
        client: inv.client,
        therapist: inv.therapist,
        lineItems: inv.lineItems.map((l) => ({
          procedureCode: l.procedureCode,
          serviceDate: l.serviceDate,
          amount: l.amount,
        })),
        remittanceLines: inv.remittanceLines.map((rl) => ({
          ra: rl.remittanceAdvice.remittanceNumber,
          raDate: rl.remittanceAdvice.invoiceDate,
          raStatus: rl.remittanceAdvice.status,
          section: rl.section,
          eobCodes: rl.eobCodes,
          eobCodeDescriptions: rl.eobCodeDescriptions,
          serviceLines: rl.serviceLines,
          matchNote: rl.matchNote,
        })),
        therapistPayRunLines: inv.payRunLines.map((pl) => ({
          amount: pl.amount,
          payoutId: pl.payoutId,
          ra: pl.payout.payRun.remittanceAdvice?.remittanceNumber ?? null,
          raSource: pl.payout.payRun.remittanceAdvice?.sourceFilename ?? null,
        })),
      },
      null,
      2,
    ),
  );

  await checkDuplicates();
  await prisma.$disconnect();
}

main();
