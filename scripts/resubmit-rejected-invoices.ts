/**
 * Return L&I-rejected invoices from Billed to Submitted so they can go out again
 * on the next 837.
 *
 * Unlike a plain status flip, this also clears payPeriodId. A rejected invoice is
 * still attached to the period it was originally billed in, and only invoices in
 * the period being generated reach the 837 — so without clearing it the invoice
 * would sit in a closed period and never be resubmitted. Clearing it returns the
 * invoice to the "needs pay period" list, where it is assigned to the current
 * period alongside the rest of that day's batch.
 *
 * clmControlNumber is preserved, so L&I receives the claim as a correction to the
 * same CLM rather than a brand new one — the 837 generator reuses an existing
 * number when present.
 *
 * paymentStatus is deliberately left alone (IN_PROCESS from the rejecting
 * remittance). The 837 does not read it, and the next remittance reconciles it.
 *
 *   npx tsx scripts/resubmit-rejected-invoices.ts --claim BF12726 --invoices 1075
 *   npx tsx scripts/resubmit-rejected-invoices.ts --claim BF12726 --invoices 1033,1045,1053 --dry-run
 */
import dotenv from "dotenv";

// .env.local first: .env carries placeholder credentials.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("DATABASE_URL not set — nothing to do.");
    return;
  }

  const claim = arg("claim");
  const numbers = (arg("invoices") ?? "")
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const dryRun = process.argv.includes("--dry-run");
  const reason = arg("reason") ?? "an incorrect client last name (EOB 140)";

  if (!claim || numbers.length === 0) {
    console.log("Usage: --claim <LNI claim number> --invoices <n,n,n> [--reason <text>] [--dry-run]");
    await prisma.$disconnect();
    return;
  }

  // Scoped by claim as well as number: invoice numbers are unique per therapist,
  // not globally, so a number alone could match another therapist's invoice.
  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: numbers }, client: { lniClaimNumber: claim } },
    orderBy: { invoiceNumber: "asc" },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      paymentStatus: true,
      billedAt: true,
      totalAmount: true,
      clmControlNumber: true,
      lniEobCodes: true,
      payPeriod: { select: { label: true } },
      payRunLines: { select: { id: true } },
      client: { select: { firstName: true, lastName: true } },
    },
  });

  const missing = numbers.filter((n) => !invoices.some((i) => i.invoiceNumber === n));
  if (missing.length) {
    console.log(`No invoice ${missing.join(", ")} for claim ${claim} — check the numbers.`);
    await prisma.$disconnect();
    return;
  }

  const admin =
    (await prisma.user.findFirst({
      where: { email: "ghim@gvcounseling.com", role: "ADMIN" },
      select: { id: true },
    })) ?? (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }));

  const note =
    `Admin reset: returned from Billed to Submitted after L&I rejected the claim for ${reason}. ` +
    `The client record has been corrected. Pay period cleared so the invoice joins the current ` +
    `batch; the same CLM control number is reused, so L&I receives this as a correction.`;

  let reset = 0;
  for (const inv of invoices) {
    const label = `#${inv.invoiceNumber} ${inv.client.lastName}, ${inv.client.firstName} ($${Number(inv.totalAmount).toFixed(2)})`;
    console.log(`\n${label}`);
    console.log(
      `  status=${inv.status}/${inv.paymentStatus} period=${inv.payPeriod?.label ?? "none"} eob=${JSON.stringify(inv.lniEobCodes)}`,
    );

    // Guards: never re-bill a claim L&I has paid, and never re-bill one the
    // therapist has already been paid for.
    if (inv.paymentStatus === "PAID") {
      console.log("  SKIP: already PAID — resubmitting would double-bill L&I.");
      continue;
    }
    if (inv.payRunLines.length > 0) {
      console.log(`  SKIP: has ${inv.payRunLines.length} therapist pay-run line(s) — resolve the payout first.`);
      continue;
    }
    if (inv.status !== "BILLED") {
      console.log(`  SKIP: status is ${inv.status}, not BILLED — nothing to reset.`);
      continue;
    }
    if (dryRun) {
      console.log("  would reset: BILLED -> SUBMITTED, billedAt cleared, pay period cleared");
      reset += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: inv.id },
        data: { status: "SUBMITTED", billedAt: null, payPeriodId: null },
      }),
      ...(admin
        ? [prisma.invoiceNote.create({ data: { invoiceId: inv.id, authorId: admin.id, body: note } })]
        : []),
    ]);

    const after = await prisma.invoice.findUnique({
      where: { id: inv.id },
      select: { status: true, billedAt: true, payPeriodId: true, clmControlNumber: true, paymentStatus: true },
    });
    console.log(
      `  reset -> ${after!.status}, billedAt=${after!.billedAt ?? "cleared"}, payPeriod=${after!.payPeriodId ?? "cleared"}`,
    );
    console.log(`  clm preserved: ${after!.clmControlNumber}  paymentStatus=${after!.paymentStatus} (next RA reconciles)`);
    reset += 1;
  }

  console.log(
    `\n${dryRun ? "Would reset" : "Reset"} ${reset} of ${invoices.length} invoice(s).`,
  );
  if (reset > 0 && !dryRun) {
    console.log("Next: Invoices -> needs pay period -> assign to the current period, then generate the 837.");
  }

  await prisma.$disconnect();
}

main();
