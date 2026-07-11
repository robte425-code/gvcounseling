import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const steven = await prisma.user.findUnique({ where: { email: "steven@gvcounseling.com" } });
  if (!steven) throw new Error("no steven");

  const numbers = [224, 233, 238, 243, 245, 246, 247, 264];
  const invoices = await prisma.invoice.findMany({
    where: { therapistId: steven.id, invoiceNumber: { in: numbers } },
    select: {
      invoiceNumber: true,
      paymentStatus: true,
      lniPaidAt: true,
      payPeriod: { select: { label: true } },
      client: { select: { lniClaimNumber: true, lastName: true } },
      payRunLines: {
        include: {
          payout: {
            include: {
              payRun: {
                include: {
                  remittanceAdvice: {
                    select: { remittanceNumber: true, invoiceDate: true, sourceFilename: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  for (const inv of invoices) {
    console.log("\n#" + inv.invoiceNumber, inv.client.lastName, inv.client.lniClaimNumber);
    console.log("  L&I:", inv.paymentStatus, inv.lniPaidAt ? inv.lniPaidAt.toISOString().slice(0, 10) : null);
    console.log("  Billing period:", inv.payPeriod?.label);
    for (const line of inv.payRunLines) {
      const ra = line.payout.payRun.remittanceAdvice;
      console.log(
        "  Pay run:",
        ra.remittanceNumber,
        ra.invoiceDate.toISOString().slice(0, 10),
        "$" + line.therapistAmount,
        ra.sourceFilename,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
