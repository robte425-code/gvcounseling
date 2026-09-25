/**
 * Pays the therapist for sessions L&I settled on a bundled bill.
 *
 * When L&I pays two of our invoices on one bill, the pay run credited the matched
 * invoice with the bill's full amount but paid a single session's rate, so the
 * other invoice was never paid out. Three sessions are owed, $251.00 in total.
 * The matcher no longer loses these (see match-remittance-to-invoices.ts), but
 * that only helps remittances imported from now on — these three are already
 * settled with L&I and sit in finalized pay runs that must not be rewritten.
 *
 * So the arrears are added to a pay run that has not been finalized yet, as an
 * explicit adjustment: the payout's therapistAmount rises above the amount
 * computed for that run and carries a note saying why. Each session also gets its
 * own pay-run line, which makes the arrears auditable per invoice and stops the
 * invoice being paid a second time — findInvoicesAlreadyPaidToTherapist treats
 * any invoice with a pay-run line as already paid.
 *
 * Run it after applying the next remittance, naming that remittance:
 *   npx tsx scripts/add-bundled-bill-pay-arrears.ts                        # lists draft runs
 *   npx tsx scripts/add-bundled-bill-pay-arrears.ts --remittance 108125 --dry-run
 *   npx tsx scripts/add-bundled-bill-pay-arrears.ts --remittance 108125
 */
import dotenv from "dotenv";

// .env.local first: .env carries placeholder credentials.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

type Arrear = {
  invoiceNumber: number;
  claimNumber: string;
  /** The bill L&I settled this session on, alongside another invoice. */
  remittanceNumber: string;
  icn: string;
  /** This session's share of that bill, as L&I's own service lines report it. */
  lniPaidAmount: number;
  /** The invoice that was matched to the bill and did get paid. */
  paidAlongside: number;
};

const ARREARS: Arrear[] = [
  { invoiceNumber: 955, claimNumber: "BM70906", remittanceNumber: "53703", icn: "52611408000008200", lniPaidAmount: 284.65, paidAlongside: 950 },
  { invoiceNumber: 1010, claimNumber: "BF12726", remittanceNumber: "80689", icn: "52618308000038000", lniPaidAmount: 211.73, paidAlongside: 1014 },
  { invoiceNumber: 1004, claimNumber: "BJ04455", remittanceNumber: "80689", icn: "52617108000043900", lniPaidAmount: 211.73, paidAlongside: 1001 },
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function money(value: unknown): number {
  return Math.round(Number(value) * 100) / 100;
}

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const { computeTherapistPayAmountForInvoice } = await import("../src/lib/invoice-therapist-payment");
  const prisma = createPrismaClient();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("DATABASE_URL not set — nothing to do.");
    return;
  }
  const dryRun = process.argv.includes("--dry-run");
  const remittanceNumber = arg("remittance");

  // The run must be named. Falling back to "the newest draft" once picked a draft
  // left over from February 2025, which would have put these 2026 arrears on a
  // year-old pay run — not a guess worth making with money.
  if (!remittanceNumber) {
    const drafts = await prisma.therapistPayRun.findMany({
      where: { status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      select: { remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } } },
    });
    console.log("Name the pay run to add the arrears to, with --remittance <number>.");
    console.log(
      drafts.length
        ? `\nDraft pay runs:\n${drafts.map((d) => `  --remittance ${d.remittanceAdvice.remittanceNumber}   (${d.remittanceAdvice.invoiceDate.toISOString().slice(0, 10)})`).join("\n")}`
        : "\nThere is no draft pay run. Apply the next remittance first.",
    );
    await prisma.$disconnect();
    return;
  }

  const payRun = await prisma.therapistPayRun.findFirst({
    where: { remittanceAdvice: { remittanceNumber } },
    select: { id: true, status: true, remittanceAdvice: { select: { remittanceNumber: true, invoiceDate: true } } },
  });

  if (!payRun) {
    console.log(`No pay run for remittance ${remittanceNumber}. Apply it first.`);
    await prisma.$disconnect();
    return;
  }

  console.log(
    `Pay run: remittance ${payRun.remittanceAdvice.remittanceNumber} (${payRun.remittanceAdvice.invoiceDate.toISOString().slice(0, 10)}), status ${payRun.status}`,
  );
  if (payRun.status !== "DRAFT") {
    console.log("refusing: that pay run is already finalized — pick a draft run with --remittance.");
    await prisma.$disconnect();
    return;
  }

  // Resolve the invoices and confirm each is still owed.
  const owed: Array<{ arrear: Arrear; invoiceId: string; therapistId: string; therapistName: string; therapistAmount: number }> = [];
  for (const arrear of ARREARS) {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: arrear.invoiceNumber, client: { lniClaimNumber: arrear.claimNumber } },
      select: {
        id: true, invoiceNumber: true, paymentStatus: true, therapistId: true, totalAmount: true,
        therapist: { select: { firstName: true, lastName: true } },
        lineItems: { select: { procedureCode: true, serviceDate: true, units: true, amount: true } },
        payRunLines: { select: { id: true } },
      },
    });
    if (!invoice) {
      console.log(`  #${arrear.invoiceNumber}: not found for claim ${arrear.claimNumber} — skipping.`);
      continue;
    }
    if (invoice.payRunLines.length > 0) {
      console.log(`  #${arrear.invoiceNumber}: already has a therapist pay line — skipping.`);
      continue;
    }
    if (invoice.paymentStatus !== "PAID") {
      console.log(`  #${arrear.invoiceNumber}: payment status is ${invoice.paymentStatus}, not PAID — skipping.`);
      continue;
    }

    const fees = await prisma.therapistProcedureCodeFee.findMany({ where: { therapistId: invoice.therapistId } });
    const therapistAmount = money(await computeTherapistPayAmountForInvoice(invoice, fees));
    owed.push({
      arrear,
      invoiceId: invoice.id,
      therapistId: invoice.therapistId,
      therapistName: `${invoice.therapist.firstName} ${invoice.therapist.lastName}`,
      therapistAmount,
    });
    console.log(
      `  #${arrear.invoiceNumber} ${arrear.claimNumber} ${invoice.therapist.firstName} ${invoice.therapist.lastName}: $${therapistAmount.toFixed(2)} (L&I paid $${arrear.lniPaidAmount.toFixed(2)} on bill ${arrear.icn} alongside #${arrear.paidAlongside})`,
    );
  }

  if (!owed.length) {
    console.log("\nNothing owed — no changes.");
    await prisma.$disconnect();
    return;
  }

  const byTherapist = new Map<string, typeof owed>();
  for (const entry of owed) {
    byTherapist.set(entry.therapistId, [...(byTherapist.get(entry.therapistId) ?? []), entry]);
  }

  for (const [therapistId, entries] of byTherapist) {
    const addedTherapist = money(entries.reduce((total, e) => total + e.therapistAmount, 0));
    const addedLni = money(entries.reduce((total, e) => total + e.arrear.lniPaidAmount, 0));
    const name = entries[0]!.therapistName;

    const payout = await prisma.therapistPayRunPayout.findUnique({
      where: { payRunId_therapistId: { payRunId: payRun.id, therapistId } },
      select: { id: true, therapistAmount: true, computedTherapistAmount: true, lniPaidAmount: true, invoiceCount: true, adjustmentNote: true },
    });

    const detail = entries
      .map((e) => `#${e.arrear.invoiceNumber} $${e.therapistAmount.toFixed(2)} (L&I bill ${e.arrear.icn}, remittance ${e.arrear.remittanceNumber}, paid alongside #${e.arrear.paidAlongside})`)
      .join("; ");
    const note =
      `Arrears for ${entries.length} session(s) L&I settled on a bundled bill: ${detail}. ` +
      `Each bill covered two of our invoices, but the pay run at the time credited the matched invoice with the ` +
      `bill's full amount and paid one session's rate, leaving these unpaid. Added here as an adjustment rather ` +
      `than by rewriting those finalized pay runs.`;

    console.log(`\n${name}: adding $${addedTherapist.toFixed(2)} across ${entries.length} session(s)`);
    if (payout) {
      console.log(`  payout now:  therapist $${money(payout.therapistAmount).toFixed(2)}  computed $${money(payout.computedTherapistAmount).toFixed(2)}  invoices ${payout.invoiceCount}`);
      console.log(`  payout after: therapist $${(money(payout.therapistAmount) + addedTherapist).toFixed(2)}  computed unchanged  invoices ${payout.invoiceCount + entries.length}`);
    } else {
      console.log(`  no payout on this run yet — one will be created for the arrears alone`);
    }
    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      const target = payout
        ? await tx.therapistPayRunPayout.update({
            where: { id: payout.id },
            data: {
              // computedTherapistAmount stays at what this run's own invoices came
              // to, so the arrears remain visible as an adjustment.
              therapistAmount: money(Number(payout.therapistAmount) + addedTherapist),
              lniPaidAmount: money(Number(payout.lniPaidAmount) + addedLni),
              invoiceCount: payout.invoiceCount + entries.length,
              adjustmentNote: payout.adjustmentNote ? `${payout.adjustmentNote}\n\n${note}` : note,
              adjustedAt: new Date(),
            },
            select: { id: true },
          })
        : await tx.therapistPayRunPayout.create({
            data: {
              payRunId: payRun.id,
              therapistId,
              therapistAmount: addedTherapist,
              computedTherapistAmount: 0,
              lniPaidAmount: addedLni,
              invoiceCount: entries.length,
              adjustmentNote: note,
              adjustedAt: new Date(),
            },
            select: { id: true },
          });

      for (const entry of entries) {
        await tx.therapistPayRunLine.create({
          data: {
            payoutId: target.id,
            invoiceId: entry.invoiceId,
            lniPaidAmount: entry.arrear.lniPaidAmount,
            therapistAmount: entry.therapistAmount,
          },
        });
      }
    });

    const after = await prisma.therapistPayRunPayout.findUnique({
      where: { payRunId_therapistId: { payRunId: payRun.id, therapistId } },
      select: { therapistAmount: true, computedTherapistAmount: true, invoiceCount: true, lines: { select: { id: true } } },
    });
    console.log(
      `  -> therapist $${money(after!.therapistAmount).toFixed(2)}  computed $${money(after!.computedTherapistAmount).toFixed(2)}  invoices ${after!.invoiceCount}  lines ${after!.lines.length}`,
    );
  }

  console.log(dryRun ? "\nDry run — nothing written." : "\nDone. Review the pay run before finalizing, then wire the total.");
  await prisma.$disconnect();
}

main();
