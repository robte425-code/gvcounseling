import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const numbers = [239, 240];
  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: numbers } },
    select: {
      invoiceNumber: true,
      paymentStatus: true,
      lniPaidAt: true,
      status: true,
      totalAmount: true,
      therapist: { select: { firstName: true, lastName: true, email: true } },
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      payPeriod: { select: { label: true } },
      payRunLines: {
        include: {
          payout: {
            include: {
              payRun: {
                include: {
                  remittanceAdvice: {
                    select: {
                      remittanceNumber: true,
                      invoiceDate: true,
                      sourceFilename: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      remittanceLines: {
        where: { supersededAt: null },
        include: {
          remittanceAdvice: {
            select: {
              remittanceNumber: true,
              invoiceDate: true,
              sourceFilename: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  for (const inv of invoices) {
    console.log(
      JSON.stringify(
        {
          invoiceNumber: inv.invoiceNumber,
          therapist: `${inv.therapist.firstName} ${inv.therapist.lastName}`,
          client: `${inv.client.lastName}, ${inv.client.firstName}`,
          claim: inv.client.lniClaimNumber,
          totalAmount: inv.totalAmount,
          workflowStatus: inv.status,
          lniPaymentStatus: inv.paymentStatus,
          lniPaidAt: inv.lniPaidAt?.toISOString().slice(0, 10) ?? null,
          billingPayPeriod: inv.payPeriod?.label ?? null,
          payRunLines: inv.payRunLines.map((l) => ({
            therapistAmount: l.therapistAmount,
            ra: l.payout.payRun.remittanceAdvice.remittanceNumber,
            raDate: l.payout.payRun.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
            raStatus: l.payout.payRun.remittanceAdvice.status,
            file: l.payout.payRun.remittanceAdvice.sourceFilename,
          })),
          raLines: inv.remittanceLines.map((l) => ({
            section: l.section,
            payable: l.payable,
            ra: l.remittanceAdvice.remittanceNumber,
            raDate: l.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
            raStatus: l.remittanceAdvice.status,
            file: l.remittanceAdvice.sourceFilename,
          })),
        },
        null,
        2,
      ),
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
