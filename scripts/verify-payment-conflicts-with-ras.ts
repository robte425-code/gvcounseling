/**
 * Deep-verify payment conflicts against all applied RA lines.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-payment-conflicts-with-ras.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { readFileSync, writeFileSync } from "fs";
import { prisma } from "../src/lib/prisma";

const CATEGORY_1 = [215, 217, 356, 805, 840, 850, 861, 851, 853, 897, 906, 956];
const CATEGORY_2 = [64, 93, 106, 185];
const CATEGORY_3 = [120, 246, 606];

type ServiceLine = {
  procedureCode?: string;
  serviceDateFrom?: string;
  serviceDateTo?: string;
};

function dosKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lineDosKeys(serviceLines: unknown): string[] {
  if (!Array.isArray(serviceLines)) return [];
  return [
    ...new Set(
      (serviceLines as ServiceLine[])
        .map((sl) => sl.serviceDateFrom ?? sl.serviceDateTo)
        .filter((d): d is string => Boolean(d)),
    ),
  ];
}

function lineCodes(serviceLines: unknown): string[] {
  if (!Array.isArray(serviceLines)) return [];
  return [...new Set((serviceLines as ServiceLine[]).map((sl) => sl.procedureCode).filter(Boolean) as string[])];
}

async function verifyInvoice(invoiceNumber: number, therapistId: string) {
  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber, therapistId },
    include: {
      client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
      lineItems: { select: { procedureCode: true, serviceDate: true, amount: true } },
      remittanceLines: {
        where: { supersededAt: null },
        include: {
          remittanceAdvice: {
            select: { remittanceNumber: true, invoiceDate: true, status: true },
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
                    select: { remittanceNumber: true, invoiceDate: true, sourceFilename: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!inv) return { invoiceNumber, error: "not found" };

  const claim = inv.client.lniClaimNumber;
  const invoiceDos = inv.lineItems.map((l) => dosKey(l.serviceDate));
  const invoiceCodes = inv.lineItems.map((l) => l.procedureCode);

  // All non-superseded RA lines for this claim on applied RAs
  const claimRaLines = await prisma.remittanceAdviceLine.findMany({
    where: {
      claimNumber: claim,
      supersededAt: null,
      remittanceAdvice: { status: "APPLIED" },
    },
    include: {
      remittanceAdvice: {
        select: { remittanceNumber: true, invoiceDate: true },
      },
      matchedInvoice: { select: { invoiceNumber: true } },
    },
    orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
  });

  // RA lines on same claim+DOS (any procedure code overlap or exact DOS match)
  const relatedByDos = claimRaLines.filter((rl) => {
    const raDos = lineDosKeys(rl.serviceLines);
    return raDos.some((d) => invoiceDos.includes(d));
  });

  const matchedToThis = relatedByDos.filter((rl) => rl.matchedInvoice?.invoiceNumber === invoiceNumber);
  const matchedToOther = relatedByDos.filter(
    (rl) => rl.matchedInvoice && rl.matchedInvoice.invoiceNumber !== invoiceNumber,
  );
  const unmatchedOnDos = relatedByDos.filter((rl) => !rl.matchedInvoice);

  const paidOnThisInvoice = matchedToThis.filter((rl) => rl.section === "PAID");
  const paidOnOtherInvoice = matchedToOther.filter((rl) => rl.section === "PAID");
  const paidUnmatched = unmatchedOnDos.filter((rl) => rl.section === "PAID");

  const latestOnThis = matchedToThis.at(-1);
  const anyPaidForDos = relatedByDos.filter((rl) => rl.section === "PAID");

  const payLines = inv.payRunLines.map((pl) => ({
    therapistAmount: Number(pl.therapistAmount),
    lniPaidAmount: Number(pl.lniPaidAmount),
    ra: pl.payout.payRun.remittanceAdvice?.remittanceNumber ?? null,
    raDate: pl.payout.payRun.remittanceAdvice?.invoiceDate?.toISOString().slice(0, 10) ?? null,
    raSource: pl.payout.payRun.remittanceAdvice?.sourceFilename ?? null,
  }));

  const totalTherapistPaid = payLines.reduce((s, p) => s + p.therapistAmount, 0);
  const uniquePaySources = [...new Set(payLines.map((p) => p.ra))];

  let verdict: string;
  if (paidOnThisInvoice.length > 0 && inv.paymentStatus === "PAID") {
    verdict = "L&I PAID on this invoice — no conflict";
  } else if (paidOnThisInvoice.length > 0 && inv.paymentStatus !== "PAID") {
    verdict = "L&I PAID on this invoice in RA but current L&I status overridden by later RA — therapist payment may be valid";
  } else if (paidOnOtherInvoice.length > 0) {
    verdict = "L&I PAID same DOS on a different invoice (possible duplicate billing)";
  } else if (paidUnmatched.length > 0) {
    verdict = "L&I PAID same claim+DOS but RA line not matched to any invoice";
  } else if (anyPaidForDos.length === 0) {
    verdict = "No PAID RA line for this claim+DOS — therapist payment not supported by L&I";
  } else {
    verdict = "Unclear — manual review";
  }

  return {
    invoiceNumber,
    client: `${inv.client.firstName} ${inv.client.lastName}`,
    claim,
    currentLniStatus: inv.paymentStatus,
    invoiceDos,
    invoiceCodes,
    verdict,
    matchedRaHistory: matchedToThis.map((rl) => ({
      ra: rl.remittanceAdvice.remittanceNumber,
      raDate: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
      section: rl.section,
      codes: lineCodes(rl.serviceLines),
      dos: lineDosKeys(rl.serviceLines),
      eobCodes: rl.eobCodes,
    })),
    paidRaOnThisInvoice: paidOnThisInvoice.map((rl) => ({
      ra: rl.remittanceAdvice.remittanceNumber,
      raDate: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
    })),
    paidRaOnOtherInvoice: paidOnOtherInvoice.map((rl) => ({
      ra: rl.remittanceAdvice.remittanceNumber,
      raDate: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
      matchedInvoice: rl.matchedInvoice?.invoiceNumber,
      codes: lineCodes(rl.serviceLines),
      dos: lineDosKeys(rl.serviceLines),
    })),
    paidRaUnmatched: paidUnmatched.map((rl) => ({
      ra: rl.remittanceAdvice.remittanceNumber,
      raDate: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
      codes: lineCodes(rl.serviceLines),
      dos: lineDosKeys(rl.serviceLines),
    })),
    latestMatchedRa: latestOnThis
      ? {
          ra: latestOnThis.remittanceAdvice.remittanceNumber,
          section: latestOnThis.section,
          date: latestOnThis.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
        }
      : null,
    therapistPayLines: payLines,
    totalTherapistPaid,
    uniquePaySources,
    doublePaid: payLines.length > 1,
    doublePaidDetail:
      payLines.length > 1
        ? `${payLines.length} pay run lines totaling $${totalTherapistPaid.toFixed(2)} from [${uniquePaySources.join(", ")}]`
        : null,
  };
}

async function main() {
  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  if (!maria) throw new Error("Maria not found");

  const audit = JSON.parse(readFileSync("scripts/audit-therapist-paid-lni-not-paid-results.json", "utf8"));
  const categories = [
    {
      name: "all_maria_conflicts",
      invoices: audit.conflicts.map((c: { invoiceNumber: number }) => c.invoiceNumber),
    },
  ];

  const results: Record<string, Awaited<ReturnType<typeof verifyInvoice>>[]> = {};

  for (const cat of categories) {
    results[cat.name] = [];
    for (const num of cat.invoices) {
      results[cat.name].push(await verifyInvoice(num, maria.id));
    }
  }

  const output = { verifiedAt: new Date().toISOString(), results };
  writeFileSync("scripts/verify-payment-conflicts-with-ras-results.json", JSON.stringify(output, null, 2));

  for (const [cat, rows] of Object.entries(results)) {
    console.log(`\n=== ${cat} ===`);
    for (const r of rows) {
      if ("error" in r && r.error) {
        console.log(`#${r.invoiceNumber}: ${r.error}`);
        continue;
      }
      const row = r as Exclude<typeof r, { error: string }>;
      console.log(
        `#${row.invoiceNumber} ${row.currentLniStatus} | ${row.verdict}` +
          (row.paidRaOnThisInvoice?.length
            ? ` | PAID on this inv: ${row.paidRaOnThisInvoice.map((p) => p.ra).join(", ")}`
            : "") +
          (row.paidRaOnOtherInvoice?.length
            ? ` | PAID other inv: ${row.paidRaOnOtherInvoice.map((p) => `#${p.matchedInvoice} RA ${p.ra}`).join("; ")}`
            : "") +
          (row.doublePaid ? ` | DOUBLE PAID: ${row.doublePaidDetail}` : ""),
      );
    }
  }

  await prisma.$disconnect();
}

main();
