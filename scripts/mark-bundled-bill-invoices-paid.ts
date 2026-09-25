/**
 * L&I sometimes settles two of our invoices on one bill: a single ICN whose
 * service lines span two dates of service. A remittance line can reference only
 * one invoice, so the matcher credits the bill to one of them and the other is
 * left showing unpaid even though L&I paid it.
 *
 * This was invisible until the PDF parser stopped dropping every service line
 * after the first (see the EOB_CODE_SUFFIX fix in parse-lni-remittance-pdf.ts).
 * With complete service lines, re-parsing all 65 remittance PDFs in Drive turns
 * up exactly three such bills, each listed below with the evidence.
 *
 * Only the invoice's own payment state is corrected here. The finalized pay runs
 * are deliberately left alone: each credited the matched invoice with the bill's
 * full amount but paid one session's rate, so therapist pay for these sessions is
 * still outstanding and should be settled through a pay run, not patched in here.
 *
 *   npx tsx scripts/mark-bundled-bill-invoices-paid.ts --dry-run
 *   npx tsx scripts/mark-bundled-bill-invoices-paid.ts
 */
import dotenv from "dotenv";

// .env.local first: .env carries placeholder credentials.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

type Correction = {
  invoiceNumber: number;
  claimNumber: string;
  remittanceNumber: string;
  icn: string;
  /** The remittance's invoice date, which is when L&I paid. */
  paidOn: string;
  billTotal: string;
  coveredDates: string;
  /** The invoice the bill was matched to instead. */
  matchedTo: number;
};

const CORRECTIONS: Correction[] = [
  {
    invoiceNumber: 955, claimNumber: "BM70906", remittanceNumber: "53703",
    icn: "52611408000008200", paidOn: "2026-04-28", billTotal: "569.30",
    coveredDates: "2026-04-14 and 2026-04-21", matchedTo: 950,
  },
  {
    invoiceNumber: 1010, claimNumber: "BF12726", remittanceNumber: "80689",
    icn: "52618308000038000", paidOn: "2026-07-07", billTotal: "433.54",
    coveredDates: "2026-06-26 and 2026-07-01", matchedTo: 1014,
  },
  {
    invoiceNumber: 1004, claimNumber: "BJ04455", remittanceNumber: "80689",
    icn: "52617108000043900", paidOn: "2026-07-07", billTotal: "423.46",
    coveredDates: "2026-06-11 and 2026-06-17", matchedTo: 1001,
  },
];

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("DATABASE_URL not set — nothing to do.");
    return;
  }
  const dryRun = process.argv.includes("--dry-run");

  const admin =
    (await prisma.user.findFirst({
      where: { email: "ghim@gvcounseling.com", role: "ADMIN" },
      select: { id: true },
    })) ?? (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }));

  let changed = 0;
  for (const c of CORRECTIONS) {
    const inv = await prisma.invoice.findFirst({
      where: { invoiceNumber: c.invoiceNumber, client: { lniClaimNumber: c.claimNumber } },
      select: {
        id: true, status: true, paymentStatus: true, lniPaidAt: true, totalAmount: true,
        client: { select: { firstName: true, lastName: true } },
        therapist: { select: { firstName: true, lastName: true } },
      },
    });
    if (!inv) {
      console.log(`#${c.invoiceNumber}: not found for claim ${c.claimNumber} — skipping.`);
      continue;
    }

    console.log(
      `\n#${c.invoiceNumber} ${inv.client.lastName}, ${inv.client.firstName} ($${Number(inv.totalAmount).toFixed(2)}, ${inv.therapist.firstName} ${inv.therapist.lastName})`,
    );
    console.log(`  now: ${inv.status}/${inv.paymentStatus} paidAt=${inv.lniPaidAt?.toISOString().slice(0, 10) ?? "—"}`);

    if (inv.paymentStatus === "PAID") {
      console.log("  SKIP: already PAID.");
      continue;
    }
    if (inv.status !== "BILLED") {
      console.log(`  SKIP: status is ${inv.status}, not BILLED — resolve it first.`);
      continue;
    }
    if (dryRun) {
      console.log(`  would mark PAID with lniPaidAt ${c.paidOn}`);
      changed += 1;
      continue;
    }

    const note =
      `Marked paid from the source remittance. L&I remittance ${c.remittanceNumber} (invoice date ${c.paidOn}) ` +
      `settled bill ICN ${c.icn} for $${c.billTotal}, whose service lines cover ${c.coveredDates} — this invoice's ` +
      `session and invoice #${c.matchedTo}'s. A remittance line can reference only one invoice, so the bill was ` +
      `matched to #${c.matchedTo} and this invoice was left showing unpaid. The detail was hidden until the PDF ` +
      `parser stopped dropping every service line after the first. Therapist pay for this session is still ` +
      `outstanding: the pay run credited #${c.matchedTo} with the bill's full amount but paid one session's rate.`;

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: inv.id },
        data: { paymentStatus: "PAID", lniPaidAt: new Date(`${c.paidOn}T00:00:00Z`) },
      }),
      ...(admin
        ? [prisma.invoiceNote.create({ data: { invoiceId: inv.id, authorId: admin.id, body: note } })]
        : []),
    ]);

    const after = await prisma.invoice.findUnique({
      where: { id: inv.id },
      select: { status: true, paymentStatus: true, lniPaidAt: true },
    });
    console.log(`  -> ${after!.status}/${after!.paymentStatus} paidAt=${after!.lniPaidAt?.toISOString().slice(0, 10)}`);
    changed += 1;
  }

  console.log(`\n${dryRun ? "Would correct" : "Corrected"} ${changed} of ${CORRECTIONS.length} invoice(s).`);
  if (changed > 0) {
    console.log("Therapist pay for these sessions remains outstanding — settle it through a pay run.");
  }

  await prisma.$disconnect();
}

main();
