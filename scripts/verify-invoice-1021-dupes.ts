import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const invs = await prisma.invoice.findMany({
    where: {
      client: { lniClaimNumber: "BL13687" },
      lineItems: { some: { serviceDate: new Date("2026-02-05T00:00:00.000Z") } },
    },
    include: {
      lineItems: true,
      payPeriod: { select: { label: true, paymentDate: true } },
      therapist: { select: { firstName: true, lastName: true } },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  console.log("All BL13687 invoices with DOS 2026-02-05:");
  for (const inv of invs) {
    console.log({
      n: inv.invoiceNumber,
      status: inv.status,
      payment: inv.paymentStatus,
      total: Number(inv.totalAmount),
      therapist: inv.therapist.firstName,
      period: inv.payPeriod?.label ?? null,
      lines: inv.lineItems.map((l) => `${l.procedureCode} $${Number(l.amount)}`),
      created: inv.createdAt.toISOString().slice(0, 10),
    });
  }

  const bhi = await prisma.invoice.findMany({
    where: {
      lineItems: {
        some: {
          serviceDate: new Date("2026-02-05T00:00:00.000Z"),
          procedureCode: { in: ["96158", "96159"] },
        },
      },
    },
    include: {
      client: { select: { lniClaimNumber: true, lastName: true, firstName: true } },
      lineItems: true,
      remittanceLines: {
        select: { remittanceAdvice: { select: { remittanceNumber: true } } },
      },
      payPeriod: { select: { label: true } },
    },
  });

  console.log("\nInvoices with 96158/96159 on 2026-02-05:");
  for (const inv of bhi) {
    console.log({
      n: inv.invoiceNumber,
      claim: inv.client.lniClaimNumber,
      client: `${inv.client.lastName}, ${inv.client.firstName}`,
      total: Number(inv.totalAmount),
      status: inv.status,
      payment: inv.paymentStatus,
      period: inv.payPeriod?.label ?? null,
      lines: inv.lineItems.map((l) => `${l.procedureCode} $${Number(l.amount)}`),
      ra: inv.remittanceLines.map((l) => l.remittanceAdvice.remittanceNumber),
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
