import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const ra = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber: "80689" },
    include: {
      lines: {
        where: { claimNumber: "BL44101" },
        include: {
          matchedInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              paymentStatus: true,
              lniPaidAt: true,
              totalAmount: true,
              lniEobCodes: true,
              lniEobCodeDescriptions: true,
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
                        },
                      },
                    },
                    orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
                  },
            },
          },
        },
      },
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
                      client: { select: { lniClaimNumber: true, lastName: true } },
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

  if (!ra) {
    console.log("RA 80689 not found");
    await prisma.$disconnect();
    return;
  }

  console.log("=== RA 80689 ===");
  console.log({
    status: ra.status,
    invoiceDate: ra.invoiceDate.toISOString().slice(0, 10),
    warrant: ra.warrantRegister,
    totalPaid: Number(ra.totalPaid),
    sourceFilename: ra.sourceFilename,
    eobCodeDescriptions: ra.eobCodeDescriptions,
  });

  console.log("\n=== BL44101 lines on this RA (" + ra.lines.length + ") ===");
  for (const line of ra.lines) {
    console.log(JSON.stringify(
      {
        lineId: line.id,
        section: line.section,
        claimNumber: line.claimNumber,
        patientName: line.patientName,
        eobCodes: line.eobCodes,
        eobCodeDescriptions: line.eobCodeDescriptions,
        billTotalPayable: Number(line.billTotalPayable),
        billTotalBilled: line.billTotalBilled != null ? Number(line.billTotalBilled) : null,
        serviceLines: line.serviceLines,
        matchNote: line.matchNote,
        supersededAt: line.supersededAt?.toISOString() ?? null,
        matchedInvoice: line.matchedInvoice
          ? {
              id: line.matchedInvoice.id,
              invoiceNumber: line.matchedInvoice.invoiceNumber,
              therapist: `${line.matchedInvoice.therapist.firstName} ${line.matchedInvoice.therapist.lastName}`,
              client: `${line.matchedInvoice.client.lastName}, ${line.matchedInvoice.client.firstName}`,
              paymentStatus: line.matchedInvoice.paymentStatus,
              lniPaidAt: line.matchedInvoice.lniPaidAt?.toISOString().slice(0, 10) ?? null,
              totalAmount: Number(line.matchedInvoice.totalAmount),
              billingPeriod: line.matchedInvoice.payPeriod?.label,
            }
          : null,
      },
      null,
      2,
    ));
  }

  const inv = ra.lines.find((l) => l.matchedInvoice)?.matchedInvoice;
  if (inv) {
    console.log("\n=== Matched invoice RA history ===");
    for (const rl of inv.remittanceLines) {
      console.log({
        ra: rl.remittanceAdvice.remittanceNumber,
        date: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
        section: rl.section,
        eobCodes: rl.eobCodes,
        payable: Number(rl.billTotalPayable),
        serviceLines: rl.serviceLines,
        file: rl.remittanceAdvice.sourceFilename,
      });
    }

    console.log("\n=== Therapist pay run history ===");
    for (const prl of inv.payRunLines) {
      const pra = prl.payout.payRun.remittanceAdvice;
      console.log({
        ra: pra.remittanceNumber,
        date: pra.invoiceDate.toISOString().slice(0, 10),
        therapistAmount: Number(prl.therapistAmount),
        lniPaidAmount: Number(prl.lniPaidAmount),
      });
    }
  }

  // All RAs mentioning BL44101
  const allBlLines = await prisma.remittanceAdviceLine.findMany({
    where: { claimNumber: "BL44101", supersededAt: null },
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
  });

  console.log("\n=== All non-superseded RA lines for BL44101 (" + allBlLines.length + ") ===");
  for (const l of allBlLines) {
    console.log({
      ra: l.remittanceAdvice.remittanceNumber,
      date: l.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
      status: l.remittanceAdvice.status,
      section: l.section,
      eobCodes: l.eobCodes,
      payable: Number(l.billTotalPayable),
      patientName: l.patientName,
      serviceLines: l.serviceLines,
      matchedInvoiceId: l.matchedInvoiceId,
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
