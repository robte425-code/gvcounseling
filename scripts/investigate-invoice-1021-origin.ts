import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: [883, 1021] } },
    include: {
      client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
      therapist: { select: { email: true, firstName: true, lastName: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      attachments: { select: { filename: true, createdAt: true } },
      payPeriod: { select: { label: true } },
      remittanceLines: {
        select: {
          icn: true,
          billTotalPayable: true,
          serviceLines: true,
          remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true, sourceFilename: true } },
        },
      },
    },
  });

  for (const inv of invoices.sort((a, b) => a.invoiceNumber - b.invoiceNumber)) {
    console.log(`\n===== #${inv.invoiceNumber} =====`);
    console.log(
      JSON.stringify(
        {
          id: inv.id,
          status: inv.status,
          paymentStatus: inv.paymentStatus,
          lniPaidAt: inv.lniPaidAt,
          total: Number(inv.totalAmount),
          therapist: inv.therapist.email,
          client: `${inv.client.lniClaimNumber} ${inv.client.lastName}, ${inv.client.firstName}`,
          payPeriod: inv.payPeriod?.label ?? null,
          submittedAt: inv.submittedAt,
          billedAt: inv.billedAt,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
          clmControlNumber: inv.clmControlNumber,
          lines: inv.lineItems.map((l) => ({
            dos: l.serviceDate.toISOString().slice(0, 10),
            code: l.procedureCode,
            amount: Number(l.amount),
            units: l.units,
          })),
          attachments: inv.attachments,
          remittanceMatches: inv.remittanceLines.map((l) => ({
            ra: l.remittanceAdvice.remittanceNumber,
            raDate: l.remittanceAdvice.invoiceDate,
            file: l.remittanceAdvice.sourceFilename,
            icn: l.icn,
            payable: Number(l.billTotalPayable),
            codes: Array.isArray(l.serviceLines)
              ? (l.serviceLines as { procedureCode?: string; payable?: number }[]).map(
                  (s) => `${s.procedureCode} $${s.payable}`,
                )
              : l.serviceLines,
          })),
        },
        null,
        2,
      ),
    );
  }

  // Nearby Maria invoice numbers created the same day as 1021
  const around = await prisma.invoice.findMany({
    where: {
      therapist: { email: "maria@gvcounseling.com" },
      createdAt: {
        gte: new Date("2026-07-06T00:00:00.000Z"),
        lt: new Date("2026-07-07T00:00:00.000Z"),
      },
    },
    select: {
      invoiceNumber: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      createdAt: true,
      client: { select: { lniClaimNumber: true, lastName: true } },
      lineItems: { select: { serviceDate: true, procedureCode: true, amount: true } },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  console.log(`\n===== Maria invoices created 2026-07-06 (${around.length}) =====`);
  for (const inv of around) {
    console.log({
      n: inv.invoiceNumber,
      claim: inv.client.lniClaimNumber,
      client: inv.client.lastName,
      status: inv.status,
      payment: inv.paymentStatus,
      total: Number(inv.totalAmount),
      createdAt: inv.createdAt.toISOString(),
      lines: inv.lineItems.map(
        (l) => `${l.serviceDate.toISOString().slice(0, 10)} ${l.procedureCode} $${Number(l.amount)}`,
      ),
    });
  }

  // Max invoice number timeline
  const maxBefore = await prisma.invoice.findFirst({
    where: { createdAt: { lt: new Date("2026-07-06T00:00:00.000Z") } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true, createdAt: true, therapist: { select: { email: true } } },
  });
  console.log("\nHighest invoice# before 2026-07-06:", maxBefore);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
