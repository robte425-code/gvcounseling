/**
 * Rebill invoices L&I denied, as new invoices.
 *
 * A denied bill is adjudicated and closed, so a rebill has to reach L&I as a new
 * claim rather than a correction to the old one. That is the difference from
 * resubmit-rejected-invoices.ts, which returns the same invoice to Submitted and
 * keeps its clmControlNumber so the 837 reuses it: right for a bill L&I never
 * decided, wrong here. Reusing the control number of a decided claim is what had
 * invoice #1069 come back "DENIED AS DUPLICATE".
 *
 * So each denied invoice is copied to a new one with no control number, which the
 * 837 generator then assigns fresh. The denial stays on the original, which keeps
 * the history of what L&I refused and why.
 *
 * The copy lands as Submitted with no pay period, which is where the billing page
 * looks for invoices needing one, so it goes out with the next batch.
 *
 *   npx tsx scripts/rebill-denied-invoices.ts --claim BM51668 --invoices 1088,1091 --dry-run
 *   npx tsx scripts/rebill-denied-invoices.ts --claim BM51668 --invoices 1088,1091 \
 *     --reason "L&I had not loaded the CPT codes for this claim; the claim manager has since loaded them and asked us to rebill"
 */
import dotenv from "dotenv";

// .env.local first: .env carries placeholder credentials.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

type Line = { procedureCode: string; serviceDate: Date; amount: number; units: number; sortOrder: number };

/** The cross-reference this script leaves on a source it has already rebilled. */
const CROSS_REFERENCE_PREFIX = "Rebilled as invoice #";

function signature(lines: Line[]): string {
  return [...lines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => `${l.procedureCode}:${l.serviceDate.toISOString().slice(0, 10)}:${l.amount}:${l.units}`)
    .join("|");
}

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const { createInvoiceWithNextNumber } = await import("../src/lib/invoice-numbers");
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
  const reason = arg("reason") ?? "L&I denied the original bill; rebilled at the claim manager's request";

  if (!claim || !numbers.length) {
    console.log("Usage: --claim <LNI claim number> --invoices <n,n> [--reason <text>] [--dry-run]");
    await prisma.$disconnect();
    return;
  }

  // Scoped by claim as well as number: invoice numbers are unique per therapist,
  // not globally, so a number alone could match another therapist's invoice.
  const sources = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: numbers }, client: { lniClaimNumber: claim } },
    orderBy: { invoiceNumber: "asc" },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      attachments: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      client: { select: { firstName: true, lastName: true } },
      therapist: { select: { firstName: true, lastName: true } },
      payRunLines: { select: { id: true } },
    },
  });

  const missing = numbers.filter((n) => !sources.some((s) => s.invoiceNumber === n));
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

  let created = 0;
  for (const source of sources) {
    const lines: Line[] = source.lineItems.map((li) => ({
      procedureCode: li.procedureCode,
      serviceDate: li.serviceDate,
      amount: Number(li.amount),
      units: li.units,
      sortOrder: li.sortOrder,
    }));
    const dos = [...new Set(lines.map((l) => l.serviceDate.toISOString().slice(0, 10)))].join(", ");
    const codes = [...new Set(lines.map((l) => l.procedureCode))].join(", ");

    console.log(
      `\n#${source.invoiceNumber} ${source.client.lastName}, ${source.client.firstName} — DOS ${dos}, ${codes}, $${Number(source.totalAmount).toFixed(2)}`,
    );
    const carriedNotes = source.notes.filter((n) => !n.body.startsWith(CROSS_REFERENCE_PREFIX));
    console.log(
      `  ${source.status}/${source.paymentStatus} eob=${JSON.stringify(source.lniEobCodes)}  ${source.attachments.length} attachment(s), ${carriedNotes.length} note(s) to carry`,
    );

    // Guards: only rebill what L&I actually refused, and never a bill it paid.
    if (source.paymentStatus === "PAID") {
      console.log("  SKIP: L&I paid this — rebilling would bill a settled service.");
      continue;
    }
    if (source.paymentStatus !== "DENIED") {
      console.log(
        `  SKIP: payment status is ${source.paymentStatus}, not DENIED. A bill L&I has not decided should be resubmitted under its own control number instead (resubmit-rejected-invoices.ts).`,
      );
      continue;
    }
    if (source.payRunLines.length > 0) {
      console.log(`  SKIP: has ${source.payRunLines.length} therapist pay line(s) — resolve the payout first.`);
      continue;
    }
    // Submitting an invoice requires at least one attachment, because the session
    // documentation is what gets faxed to L&I with the bill. A rebill inherits the
    // original's attachments, so with none to inherit there is nothing to submit.
    if (!source.attachments.length) {
      console.log(
        "  SKIP: the original has no attachments, so the rebill would have no session documentation to fax. Attach the notes to it first.",
      );
      continue;
    }

    // An identical un-adjudicated invoice means this already ran.
    const existing = await prisma.invoice.findMany({
      where: { clientId: source.clientId, id: { not: source.id }, status: { in: ["DRAFT", "SUBMITTED"] } },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    const already = existing.find(
      (c) =>
        signature(
          c.lineItems.map((li) => ({
            procedureCode: li.procedureCode,
            serviceDate: li.serviceDate,
            amount: Number(li.amount),
            units: li.units,
            sortOrder: li.sortOrder,
          })),
        ) === signature(lines),
    );
    if (already) {
      console.log(`  SKIP: #${already.invoiceNumber} already covers these lines and is ${already.status}.`);
      continue;
    }

    if (dryRun) {
      console.log(
        `  would create a new Submitted invoice: same lines, ${source.attachments.length} attachment(s) carried over, no pay period, no control number`,
      );
      for (const a of source.attachments) console.log(`     file: ${a.filename}`);
      for (const n of carriedNotes) console.log(`     note: ${n.createdAt.toISOString().slice(0, 10)} ${n.body.slice(0, 60)}…`);
      created += 1;
      continue;
    }

    const note =
      `Rebill of invoice #${source.invoiceNumber}, which L&I denied` +
      `${source.lniEobCodes.length ? ` (EOB ${source.lniEobCodes.join(", ")})` : ""}. Reason for rebilling: ${reason}. ` +
      `Raised as a new claim rather than a resubmission of #${source.invoiceNumber}: that bill has been adjudicated, ` +
      `and reusing the control number of a decided claim is refused as a duplicate. This invoice therefore carries no ` +
      `control number until the next 837 assigns one.`;

    const newNumber = await createInvoiceWithNextNumber(prisma, source.therapistId, async (invoiceNumber) => {
      await prisma.invoice.create({
        data: {
          therapistId: source.therapistId,
          clientId: source.clientId,
          invoiceNumber,
          status: "SUBMITTED",
          submittedAt: new Date(),
          paymentStatus: null,
          lniPaidAt: null,
          lniEobCodes: [],
          lniEobCodeDescriptions: {},
          totalAmount: Number(source.totalAmount),
          billedAt: null,
          payPeriodId: null,
          clmControlNumber: null,
          lineItems: {
            create: lines.map((l) => ({
              serviceDate: l.serviceDate,
              procedureCode: l.procedureCode,
              amount: l.amount,
              units: l.units,
              sortOrder: l.sortOrder,
            })),
          },
          // The same session documentation, pointing at the same stored files.
          // These are Drive links and nothing deletes the file when an attachment
          // row goes, so both invoices referring to one file is safe — and it is
          // the same session, so they should refer to the same notes.
          attachments: {
            create: source.attachments.map((a) => ({
              filename: a.filename,
              blobUrl: a.blobUrl,
              contentType: a.contentType,
              size: a.size,
            })),
          },
          notes: {
            create: [
              // The source's own notes come first, in their original order, each
              // keeping its author. createdAt cannot be carried over, so the date
              // it was written is stated in the body rather than lost.
              ...carriedNotes.map((n) => ({
                authorId: n.authorId,
                body: `Carried over from invoice #${source.invoiceNumber}, written ${n.createdAt.toISOString().slice(0, 10)}:\n\n${n.body}`,
              })),
              ...(admin ? [{ authorId: admin.id, body: note }] : []),
            ],
          },
        },
      });
      return invoiceNumber;
    });

    if (admin) {
      await prisma.invoiceNote.create({
        data: {
          invoiceId: source.id,
          authorId: admin.id,
          body:
            `Rebilled as invoice #${newNumber}. ${reason}. This invoice stays Denied as the record of what L&I ` +
            `refused; the rebill goes out as a new claim with its own control number.`,
        },
      });
    }

    console.log(
      `  -> created #${newNumber}: Submitted, ${source.attachments.length} attachment(s), ${carriedNotes.length} note(s) carried, no pay period, no control number`,
    );
    created += 1;
  }

  console.log(`\n${dryRun ? "Would create" : "Created"} ${created} invoice(s) of ${sources.length}.`);
  if (created > 0 && !dryRun) {
    console.log("Next: Invoices -> needs pay period -> assign to the current period, then generate the 837.");
  }

  await prisma.$disconnect();
}

main();
