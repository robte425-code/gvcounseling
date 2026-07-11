import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  for (const raNum of ["25733", "37039"]) {
    const ra = await prisma.remittanceAdvice.findFirst({
      where: { remittanceNumber: raNum },
      include: {
        payRun: {
          include: {
            payouts: {
              include: {
                therapist: { select: { firstName: true, lastName: true } },
                lines: {
                  include: {
                    invoice: {
                      select: {
                        invoiceNumber: true,
                        payPeriod: { select: { label: true } },
                        client: { select: { lastName: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!ra) continue;
    console.log(`\n=== RA ${raNum} ${ra.invoiceDate.toISOString().slice(0, 10)} ===`);
    for (const p of ra.payRun?.payouts ?? []) {
      const feb27 = p.lines.filter((l) => l.invoice.payPeriod?.label?.includes("Feb 27, 2026"));
      if (!feb27.length) continue;
      console.log(` ${p.therapist.firstName}: ${feb27.length} Feb 27 period invoices`);
      for (const l of feb27) {
        console.log(`   #${l.invoice.invoiceNumber} ${l.invoice.client.lastName} $${l.therapistAmount}`);
      }
    }
  }

  // Spreadsheet RAs
  for (const name of ["STEVEN-SPREADSHEET", "MARIA-SPREADSHEET"]) {
    const ra = await prisma.remittanceAdvice.findFirst({
      where: { remittanceNumber: name },
      select: { invoiceDate: true, status: true, sourceFilename: true, payRun: { select: { payouts: { select: { invoiceCount: true, therapist: { select: { firstName: true } } } } } } },
    });
    console.log(`\n${name}:`, ra);
  }

  await prisma.$disconnect();
}

main();
