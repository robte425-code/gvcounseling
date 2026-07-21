/**
 * One-shot: set therapist Steven invoice #263 back to BILLED so the 7/21 RA
 * (ZB62154 PAID) can match and apply. That invoice was reset to SUBMITTED with
 * the rejected July 17 batch; it should not be re-included in a new 837.
 *
 * Runs once on production build; completion marker in PortalSetting.
 *
 * Manual:
 *   FORCE_RESTORE_INVOICE_263_BILLED=1 npx tsx scripts/restore-invoice-263-billed.ts
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

const DONE_KEY = "restore_invoice_263_billed_done";
const REPORT_KEY = "restore_invoice_263_billed_report";
const TARGET_INVOICE_NUMBER = 263;
const NOTE_BODY =
  "Admin restore: workflow status set back to Billed so the 2026-07-21 RA (ZB62154 PAID) can match and apply. Do not include this invoice in a regenerated 837.";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("restore-invoice-263-billed: DATABASE_URL not set — skipping");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");

  const force = process.env.FORCE_RESTORE_INVOICE_263_BILLED?.trim() === "1";
  if (!force) {
    const done = await prisma.portalSetting.findUnique({
      where: { key: DONE_KEY },
      select: { value: true },
    });
    if (done) {
      console.log("restore-invoice-263-billed: already completed — skipping");
      await prisma.$disconnect();
      return;
    }
  }

  const candidates = await prisma.invoice.findMany({
    where: { invoiceNumber: TARGET_INVOICE_NUMBER },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      billedAt: true,
      paymentStatus: true,
      clmControlNumber: true,
      totalAmount: true,
      therapist: { select: { id: true, firstName: true, lastName: true, email: true } },
      client: { select: { lniClaimNumber: true, firstName: true, lastName: true } },
    },
  });

  const invoice =
    candidates.find(
      (row) =>
        /steven/i.test(row.therapist.firstName) ||
        /steven|sample/i.test(row.therapist.lastName) ||
        /steven/i.test(row.therapist.email ?? ""),
    ) ?? (candidates.length === 1 ? candidates[0] : null);

  const lines: string[] = [];
  lines.push(`Restore invoice #${TARGET_INVOICE_NUMBER} to BILLED`);
  lines.push(`Ran at: ${new Date().toISOString()}`);
  lines.push(`Candidates with invoiceNumber=${TARGET_INVOICE_NUMBER}: ${candidates.length}`);
  for (const row of candidates) {
    lines.push(
      `  id=${row.id} therapist=${row.therapist.firstName} ${row.therapist.lastName}` +
        ` claim=${row.client.lniClaimNumber} status=${row.status}` +
        ` payment=${row.paymentStatus ?? "null"} clm=${row.clmControlNumber ?? "—"}` +
        ` $${Number(row.totalAmount).toFixed(2)}`,
    );
  }

  if (!invoice) {
    const report = lines.concat(["ERROR: could not uniquely identify Steven invoice #263"]).join("\n");
    console.error(report);
    await prisma.portalSetting.upsert({
      where: { key: REPORT_KEY },
      create: { key: REPORT_KEY, value: report },
      update: { value: report },
    });
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
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

  const billedAt = invoice.billedAt ?? new Date();
  const before = `status=${invoice.status} billedAt=${invoice.billedAt?.toISOString() ?? "null"}`;

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "BILLED", billedAt },
    }),
    ...(admin
      ? [
          prisma.invoiceNote.create({
            data: {
              invoiceId: invoice.id,
              authorId: admin.id,
              body: NOTE_BODY,
            },
          }),
        ]
      : []),
  ]);

  const { rematchUnresolvedOnOpenPreviews } = await import("../src/lib/remittance-advice");
  const rematched = await rematchUnresolvedOnOpenPreviews();

  lines.push("");
  lines.push(
    `Updated id=${invoice.id} #${invoice.invoiceNumber} ${invoice.client.lniClaimNumber}` +
      ` (${invoice.therapist.firstName} ${invoice.therapist.lastName}): ${before} → status=BILLED billedAt=${billedAt.toISOString()}`,
  );
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

  console.log("restore-invoice-263-billed: done");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("restore-invoice-263-billed: failed", error);
  process.exit(1);
});
