import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const ra = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber: "80689" },
    include: {
      lines: {
        include: {
          matchedInvoice: {
            select: { invoiceNumber: true, paymentStatus: true, lniPaidAt: true },
          },
        },
        orderBy: [{ section: "asc" }, { claimNumber: "asc" }],
      },
    },
  });

  if (!ra) throw new Error("no ra");

  console.log("RA totalPaid:", Number(ra.totalPaid));
  console.log("\n=== Lines with EOB 309 or negative payable ===");
  for (const line of ra.lines) {
    const payable = Number(line.billTotalPayable);
    const has309 = line.eobCodes.includes("309");
    if (has309 || payable < 0 || line.section === "DENIED") {
      console.log({
        claim: line.claimNumber,
        section: line.section,
        payable,
        eobCodes: line.eobCodes,
        eobDesc: line.eobCodeDescriptions,
        dos: line.serviceLines,
        invoice: line.matchedInvoice?.invoiceNumber,
        invStatus: line.matchedInvoice?.paymentStatus,
      });
    }
  }

  console.log("\n=== All EOB codes on RA ===");
  const codes = new Map<string, number>();
  for (const line of ra.lines) {
    for (const code of line.eobCodes) {
      codes.set(code, (codes.get(code) ?? 0) + 1);
    }
  }
  console.log([...codes.entries()]);
  console.log("RA-level EOB 309 desc:", (ra.eobCodeDescriptions as Record<string, string>)?.["309"]);

  const inv993 = await prisma.invoice.findFirst({
    where: { invoiceNumber: 993 },
    include: {
      therapist: { select: { firstName: true, lastName: true } },
      client: { select: { lastName: true, firstName: true } },
      lineItems: true,
      payRunLines: {
        include: {
          payout: {
            include: {
              payRun: {
                include: {
                  remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
                },
              },
            },
          },
        },
      },
      remittanceLines: {
        where: { supersededAt: null },
        include: {
          remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } },
        },
        orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
      },
    },
  });

  console.log("\n=== Invoice #993 detail ===");
  if (inv993) {
    console.log({
      therapist: `${inv993.therapist.firstName} ${inv993.therapist.lastName}`,
      client: `${inv993.client.lastName}, ${inv993.client.firstName}`,
      status: inv993.paymentStatus,
      lniPaidAt: inv993.lniPaidAt?.toISOString().slice(0, 10),
      lniEobCodes: inv993.lniEobCodes,
      lineItems: inv993.lineItems.map((li) => ({
        code: li.procedureCode,
        amount: Number(li.amount),
        dos: li.serviceDate.toISOString().slice(0, 10),
      })),
      payRuns: inv993.payRunLines.map((l) => ({
        ra: l.payout.payRun.remittanceAdvice.remittanceNumber,
        date: l.payout.payRun.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
        therapist: Number(l.therapistAmount),
      })),
      raLines: inv993.remittanceLines.map((l) => ({
        ra: l.remittanceAdvice.remittanceNumber,
        date: l.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
        section: l.section,
        eob: l.eobCodes,
        payable: Number(l.billTotalPayable),
      })),
    });
  }

  // Sum positive vs denied payables on RA
  let paidTotal = 0;
  let deniedTotal = 0;
  let negativeTotal = 0;
  for (const line of ra.lines) {
    const p = Number(line.billTotalPayable);
    if (p < 0) negativeTotal += p;
    else if (line.section === "DENIED") deniedTotal += p;
    else if (line.section === "PAID") paidTotal += p;
  }
  console.log("\n=== RA 80689 payable totals by section ===");
  console.log({ paidTotal, deniedTotal, negativeTotal, lineCount: ra.lines.length });

  await prisma.$disconnect();
}

main();
