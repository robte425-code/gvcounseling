import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { readFileSync, writeFileSync } from "fs";
import { calendarIsoFromDate } from "../src/lib/constants";
import { prisma } from "../src/lib/prisma";

const TARGET_INVOICE_NUMBERS = [805, 840, 850, 861, 851, 853, 897, 906, 956];

async function main() {
  const maria = await prisma.user.findFirst({ where: { email: "maria@gvcounseling.com" } });
  if (!maria) throw new Error("Maria not found");

  const driveRescan = JSON.parse(
    readFileSync("scripts/rescan-ras-category1-invoices-gt800-results.json", "utf8"),
  ) as {
    results: Array<{
      invoiceNumber: number;
      allRaSections: Array<{ ra: string; date: string; section: string }>;
    }>;
  };

  const driveByInvoice = new Map(
    driveRescan.results.map((r) => [r.invoiceNumber, r.allRaSections ?? []]),
  );

  const output: Array<Record<string, unknown>> = [];

  for (const n of TARGET_INVOICE_NUMBERS) {
    const inv = await prisma.invoice.findFirst({
      where: { invoiceNumber: n, therapistId: maria.id },
      include: {
        client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
        lineItems: { select: { procedureCode: true, serviceDate: true } },
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
          orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
        },
      },
    });

    if (!inv) {
      output.push({ invoiceNumber: n, error: "not found" });
      continue;
    }

    const matchedRas = inv.remittanceLines.map((rl) => ({
      remittanceNumber: rl.remittanceAdvice.remittanceNumber,
      invoiceDate: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
      raStatus: rl.remittanceAdvice.status,
      section: rl.section,
      sourceFilename: rl.remittanceAdvice.sourceFilename,
      eobCodes: rl.eobCodes,
    }));

    // Claim+DOS RAs from Drive parse (may include bills not matched to this invoice in DB)
    const claim = inv.client.lniClaimNumber;
    const dos = [...new Set(inv.lineItems.map((l) => calendarIsoFromDate(l.serviceDate)))];
    const claimLines = await prisma.remittanceAdviceLine.findMany({
      where: {
        claimNumber: claim,
        supersededAt: null,
        remittanceAdvice: { status: "APPLIED" },
      },
      include: {
        remittanceAdvice: {
          select: { remittanceNumber: true, invoiceDate: true, sourceFilename: true },
        },
        matchedInvoice: { select: { invoiceNumber: true } },
      },
      orderBy: { remittanceAdvice: { invoiceDate: "asc" } },
    });

    const claimDosRas = [
      ...new Map(
        claimLines
          .filter((rl) => {
            const sl = JSON.stringify(rl.serviceLines);
            return dos.some((d) => sl.includes(d));
          })
          .map((rl) => [
            rl.remittanceAdvice.remittanceNumber,
            {
              remittanceNumber: rl.remittanceAdvice.remittanceNumber,
              invoiceDate: rl.remittanceAdvice.invoiceDate.toISOString().slice(0, 10),
              section: rl.section,
              sourceFilename: rl.remittanceAdvice.sourceFilename,
              matchedInvoice: rl.matchedInvoice?.invoiceNumber ?? null,
            },
          ]),
      ).values(),
    ];

    const uniqueFilenamesMatched = [
      ...new Set(matchedRas.map((r) => r.sourceFilename).filter(Boolean)),
    ];
    const uniqueFilenamesClaimDos = [
      ...new Set(claimDosRas.map((r) => r.sourceFilename).filter(Boolean)),
    ];

    output.push({
      invoiceNumber: n,
      client: `${inv.client.firstName} ${inv.client.lastName}`,
      claim,
      dos,
      paymentStatus: inv.paymentStatus,
      raFilenamesMatchedToInvoice: uniqueFilenamesMatched,
      remittanceAdviceMatchedToInvoice: matchedRas,
      raFilenamesSameClaimAndDos: uniqueFilenamesClaimDos,
      remittanceAdviceSameClaimAndDos: claimDosRas,
      driveParsedSections: driveByInvoice.get(n) ?? [],
    });
  }

  const path = "scripts/invoice-ra-filenames-category1-gt800.json";
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), invoices: output }, null, 2));

  for (const row of output) {
    if ("error" in row) {
      console.log(`#${row.invoiceNumber}: ${row.error}`);
      continue;
    }
    const r = row as {
      invoiceNumber: number;
      client: string;
      claim: string;
      paymentStatus: string;
      raFilenamesMatchedToInvoice: string[];
      raFilenamesSameClaimAndDos: string[];
      remittanceAdviceMatchedToInvoice: Array<{
        remittanceNumber: string;
        section: string;
        sourceFilename: string | null;
      }>;
    };
    console.log(`\n#${r.invoiceNumber} ${r.client} (${r.claim}) — L&I ${r.paymentStatus}`);
    console.log("  Matched to this invoice:");
    if (r.remittanceAdviceMatchedToInvoice.length === 0) {
      console.log("    (none)");
    } else {
      for (const ra of r.remittanceAdviceMatchedToInvoice) {
        console.log(`    RA ${ra.remittanceNumber} ${ra.section} → ${ra.sourceFilename ?? "?"}`);
      }
    }
    console.log("  Same claim+DOS (any matched invoice):");
    if (r.raFilenamesSameClaimAndDos.length === 0) {
      console.log("    (none)");
    } else {
      for (const f of r.raFilenamesSameClaimAndDos) {
        console.log(`    ${f}`);
      }
    }
  }
  console.log(`\nWrote ${path}`);
  await prisma.$disconnect();
}

main();
