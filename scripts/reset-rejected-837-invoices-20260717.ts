/**
 * One-shot: reset July 17 2026 pay-period invoices from BILLED → SUBMITTED so they
 * can be regenerated after L&I rejected the production 837 (999 IK5*R / AK9*R*1*1*0).
 *
 * Skips invoices already marked PAID on an RA (avoid double-bill risk).
 * Runs once on production build; records a completion marker + report in PortalSetting.
 *
 * Manual:
 *   FORCE_RESET_REJECTED_837_20260717=1 npx tsx scripts/reset-rejected-837-invoices-20260717.ts
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

const CUTOFF_ISO = "2026-07-17";
const DONE_KEY = "reset_rejected_837_20260717_done";
const REPORT_KEY = "reset_rejected_837_20260717_report";
const NOTE_BODY =
  "Admin reset: workflow status returned from Billed → Submitted after L&I 999 rejected the 2026-07-17 production 837 (NM1/SBR element positions). Ready to regenerate Production (P) 837.";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("reset-rejected-837-20260717: DATABASE_URL not set — skipping");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  const { calendarIsoFromDate } = await import("../src/lib/constants");

  const force = process.env.FORCE_RESET_REJECTED_837_20260717?.trim() === "1";
  if (!force) {
    const done = await prisma.portalSetting.findUnique({
      where: { key: DONE_KEY },
      select: { value: true },
    });
    if (done) {
      console.log("reset-rejected-837-20260717: already completed — skipping");
      await prisma.$disconnect();
      return;
    }
  }

  const periods = await prisma.payPeriod.findMany({ orderBy: { cutoffDate: "desc" } });
  const payPeriod = periods.find((p) => calendarIsoFromDate(p.cutoffDate) === CUTOFF_ISO);
  if (!payPeriod) {
    console.error(`reset-rejected-837-20260717: no pay period with cutoff ${CUTOFF_ISO}`);
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

  const billed = await prisma.invoice.findMany({
    where: { payPeriodId: payPeriod.id, status: "BILLED" },
    select: {
      id: true,
      invoiceNumber: true,
      paymentStatus: true,
      clmControlNumber: true,
      totalAmount: true,
      billedAt: true,
      client: { select: { lniClaimNumber: true, lastName: true, firstName: true } },
      lineItems: { select: { serviceDate: true, procedureCode: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { invoiceNumber: "asc" },
  });

  const toReset = billed.filter((inv) => inv.paymentStatus !== "PAID");
  const skippedPaid = billed.filter((inv) => inv.paymentStatus === "PAID");

  const lines: string[] = [];
  lines.push(`Reset rejected 837 invoices for cutoff ${CUTOFF_ISO}`);
  lines.push(`Ran at: ${new Date().toISOString()}`);
  lines.push(`Pay period id: ${payPeriod.id} label=${payPeriod.label ?? ""}`);
  lines.push(`Billed on period: ${billed.length}`);
  lines.push(`Resetting (not PAID): ${toReset.length}`);
  lines.push(`Skipped (PAID): ${skippedPaid.length}`);
  lines.push("");

  if (skippedPaid.length) {
    lines.push("Skipped PAID:");
    for (const inv of skippedPaid) {
      lines.push(
        `  #${inv.invoiceNumber} ${inv.client.lniClaimNumber} ${inv.client.lastName}, ${inv.client.firstName}` +
          ` clm=${inv.clmControlNumber ?? "—"} $${Number(inv.totalAmount).toFixed(2)}`,
      );
    }
    lines.push("");
  }

  lines.push("Resetting:");
  for (const inv of toReset) {
    const dos = inv.lineItems
      .map((li) => calendarIsoFromDate(li.serviceDate))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(",");
    lines.push(
      `  #${inv.invoiceNumber} ${inv.client.lniClaimNumber} ${inv.client.lastName}, ${inv.client.firstName}` +
        ` dos=${dos || "—"} paymentStatus=${inv.paymentStatus ?? "null"}` +
        ` clm=${inv.clmControlNumber ?? "—"} $${Number(inv.totalAmount).toFixed(2)}`,
    );
  }

  if (toReset.length) {
    await prisma.$transaction([
      ...toReset.map((inv) =>
        prisma.invoice.update({
          where: { id: inv.id },
          data: { status: "SUBMITTED", billedAt: null },
        }),
      ),
      ...(admin
        ? toReset.map((inv) =>
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
    `reset-rejected-837-20260717: done reset=${toReset.length} skippedPaid=${skippedPaid.length}`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("reset-rejected-837-20260717: failed", error);
  process.exit(1);
});
