/**
 * One-shot: restore SUBMITTED invoices for 7/21 RA claims to BILLED so auto-match works:
 * - BJ04455 service date 2026-06-02 (paid + duplicate denial on RA)
 * - BG46680 service date 2026-06-30 (in process on RA)
 * Then rematch unresolved lines on open PREVIEW remittances.
 *
 * Manual:
 *   FORCE_RESTORE_RA721_BILLED=1 npx tsx scripts/restore-ra721-claim-invoices-billed.ts
 */
import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import path from "path";

function loadSmokeEnv() {
  const file = path.join(process.cwd(), ".env.smoke.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadSmokeEnv();

const DONE_KEY = "restore_ra721_claim_invoices_billed_done";
const REPORT_KEY = "restore_ra721_claim_invoices_billed_report";

const TARGETS = [
  { claimNumber: "BJ04455", serviceDateIso: "2026-06-02" },
  { claimNumber: "BG46680", serviceDateIso: "2026-06-30" },
] as const;

const NOTE_BODY =
  "Admin restore: workflow status set back to Billed so the 2026-07-21 RA can auto-match. Review duplicate denial lines on the RA (match or discard). Do not include already-paid/in-process claims in a regenerated 837.";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("restore-ra721-claim-invoices-billed: DATABASE_URL not set — skipping");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  const { calendarIsoFromDate } = await import("../src/lib/constants");
  const { rematchUnresolvedOnOpenPreviews } = await import("../src/lib/remittance-advice");

  const force = process.env.FORCE_RESTORE_RA721_BILLED?.trim() === "1";
  if (!force) {
    const done = await prisma.portalSetting.findUnique({
      where: { key: DONE_KEY },
      select: { value: true },
    });
    if (done) {
      console.log("restore-ra721-claim-invoices-billed: already completed — skipping");
      await prisma.$disconnect();
      return;
    }
  }

  const admin =
    (await prisma.user.findFirst({
      where: { email: "ghim@gvcounseling.com", role: "ADMIN" },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    }));

  const lines: string[] = [];
  lines.push("Restore 7/21 RA claim invoices to BILLED");
  lines.push(`Ran at: ${new Date().toISOString()}`);

  const toRestore: Array<{
    id: string;
    invoiceNumber: number;
    claimNumber: string;
    status: string;
    billedAt: Date | null;
  }> = [];

  for (const target of TARGETS) {
    const candidates = await prisma.invoice.findMany({
      where: {
        client: { lniClaimNumber: target.claimNumber },
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        billedAt: true,
        paymentStatus: true,
        totalAmount: true,
        therapist: { select: { firstName: true, lastName: true } },
        client: { select: { lniClaimNumber: true, lastName: true, firstName: true } },
        lineItems: { select: { serviceDate: true, procedureCode: true } },
      },
      orderBy: { invoiceNumber: "asc" },
    });

    const onDate = candidates.filter((inv) =>
      inv.lineItems.some((li) => calendarIsoFromDate(li.serviceDate) === target.serviceDateIso),
    );

    lines.push("");
    lines.push(`Claim ${target.claimNumber} DOS ${target.serviceDateIso}: ${onDate.length} invoice(s)`);
    for (const inv of onDate) {
      const dos = inv.lineItems
        .map((li) => calendarIsoFromDate(li.serviceDate))
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(",");
      lines.push(
        `  #${inv.invoiceNumber} ${inv.therapist.firstName} ${inv.therapist.lastName}` +
          ` status=${inv.status} payment=${inv.paymentStatus ?? "null"}` +
          ` dos=${dos} $${Number(inv.totalAmount).toFixed(2)}`,
      );
      if (inv.status === "SUBMITTED") {
        toRestore.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          claimNumber: target.claimNumber,
          status: inv.status,
          billedAt: inv.billedAt,
        });
      }
    }
  }

  lines.push("");
  lines.push(`Restoring SUBMITTED → BILLED: ${toRestore.length}`);

  if (toRestore.length) {
    await prisma.$transaction([
      ...toRestore.map((inv) =>
        prisma.invoice.update({
          where: { id: inv.id },
          data: { status: "BILLED", billedAt: inv.billedAt ?? new Date() },
        }),
      ),
      ...(admin
        ? toRestore.map((inv) =>
            prisma.invoiceNote.create({
              data: {
                invoiceId: inv.id,
                authorId: admin.id,
                body: NOTE_BODY,
              },
            }),
          )
        : []),
    ]);
  }

  const rematched = await rematchUnresolvedOnOpenPreviews();
  lines.push(`Rematched unresolved preview lines updated: ${rematched}`);

  const report = lines.join("\n");
  console.log(report);

  await prisma.portalSetting.upsert({
    where: { key: REPORT_KEY },
    create: { key: REPORT_KEY, value: report },
    update: { value: report },
  });
  await prisma.portalSetting.upsert({
    where: { key: DONE_KEY },
    create: { key: DONE_KEY, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });

  console.log(
    `restore-ra721-claim-invoices-billed: done restored=${toRestore.length} rematchedLines=${rematched}`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("restore-ra721-claim-invoices-billed: failed", error);
  process.exit(1);
});
