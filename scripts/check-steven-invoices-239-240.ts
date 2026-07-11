import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const steven = await prisma.user.findUnique({ where: { email: "steven@gvcounseling.com" } });
  if (!steven) throw new Error("no steven");

  const numbers = [239, 240];
  const invoices = await prisma.invoice.findMany({
    where: { therapistId: steven.id, invoiceNumber: { in: numbers } },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      paymentStatus: true,
      lniPaidAt: true,
      lniEobCodes: true,
      submittedAt: true,
      billedAt: true,
      totalAmount: true,
      clmControlNumber: true,
      payPeriod: { select: { label: true } },
      client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
      lineItems: { select: { serviceDate: true, procedureCode: true, amount: true }, orderBy: { sortOrder: "asc" } },
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
                      status: true,
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
    },
    orderBy: { invoiceNumber: "asc" },
  });

  for (const inv of invoices) {
    console.log("\n" + "=".repeat(60));
    console.log(
      `#${inv.invoiceNumber} ${inv.client.firstName} ${inv.client.lastName} claim ${inv.client.lniClaimNumber}`,
    );
    console.log("Portal status:", inv.status);
    console.log("paymentStatus:", inv.paymentStatus);
    console.log("lniPaidAt:", inv.lniPaidAt ? inv.lniPaidAt.toISOString() : null);
    console.log("lniEobCodes:", inv.lniEobCodes);
    console.log("submittedAt:", inv.submittedAt?.toISOString() ?? null);
    console.log("billedAt:", inv.billedAt?.toISOString() ?? null);
    console.log("totalAmount:", String(inv.totalAmount));
    console.log("clmControlNumber:", inv.clmControlNumber);
    console.log("Billing pay period:", inv.payPeriod?.label ?? "(none)");
    console.log("Line items:");
    for (const li of inv.lineItems) {
      console.log(
        " ",
        li.serviceDate.toISOString().slice(0, 10),
        li.procedureCode,
        "$" + li.amount,
      );
    }

    console.log("Pay run lines:", inv.payRunLines.length);
    for (const line of inv.payRunLines) {
      const ra = line.payout.payRun.remittanceAdvice;
      console.log(
        "  RA",
        ra.remittanceNumber,
        "invoiceDate",
        ra.invoiceDate.toISOString().slice(0, 10),
        "therapist $",
        line.therapistAmount,
        "RA status",
        ra.status,
        ra.sourceFilename ?? "",
      );
    }

    console.log("Matched remittance lines (all, incl superseded):", inv.remittanceLines.length);
    for (const rl of inv.remittanceLines) {
      const ra = rl.remittanceAdvice;
      console.log(
        "  RA",
        ra.remittanceNumber,
        ra.invoiceDate.toISOString().slice(0, 10),
        "section",
        rl.section,
        "billTotalPayable",
        String(rl.billTotalPayable),
        "supersededAt",
        rl.supersededAt?.toISOString() ?? null,
        "RA status",
        ra.status,
        "eob",
        rl.eobCodes.join(","),
      );
      console.log("    serviceLines:", JSON.stringify(rl.serviceLines).slice(0, 200));
    }
  }

  const claims = ["BL69750", "BH00259"];
  console.log("\n" + "=".repeat(60));
  console.log("RA lines by claim (matchedInvoiceId for 239/240 or claim only):");
  for (const claim of claims) {
    const lines = await prisma.remittanceAdviceLine.findMany({
      where: { claimNumber: claim },
      include: {
        remittanceAdvice: {
          select: { remittanceNumber: true, invoiceDate: true, status: true },
        },
        matchedInvoice: {
          select: { invoiceNumber: true, therapistId: true },
        },
      },
      orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
    });
    console.log(`\nClaim ${claim}: ${lines.length} RA line(s)`);
    for (const l of lines) {
      const invNum = l.matchedInvoice?.invoiceNumber;
      const is239240 = invNum === 239 || invNum === 240;
      const sl = JSON.stringify(l.serviceLines);
      const dos316 = sl.includes("2026-03-16") || sl.includes("03/16/2026") || sl.includes("3/16/26");
      const dos318 = sl.includes("2026-03-18") || sl.includes("03/18/2026") || sl.includes("3/18/26");
      if (is239240 || dos316 || dos318 || !l.supersededAt) {
        console.log(
          " ",
          l.remittanceAdvice.remittanceNumber,
          l.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
          "matched inv",
          invNum ?? "-",
          "section",
          l.section,
          "payable",
          String(l.billTotalPayable),
          "superseded",
          l.supersededAt ? "yes" : "no",
          "RA",
          l.remittanceAdvice.status,
        );
        console.log("    ", sl.slice(0, 180));
      }
    }
  }

  if (invoices.length < 2) {
    console.log("\nWARNING: found only", invoices.length, "invoice(s)");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
