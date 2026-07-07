/**
 * Revert and re-import a single remittance advice from Drive, then apply it.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/reimport-single-remittance.ts 70106
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { getSystemDriveAccessToken } from "../src/lib/google-drive-system";
import {
  downloadLniRemittancePdf,
  listLniRemittanceAdvicePdfs,
} from "../src/lib/lni-remittance-drive";
import {
  applyRemittanceAdvice,
  importRemittancePreview,
  revertAppliedRemittance,
  reconcileInvoicePaymentStatus,
} from "../src/lib/remittance-advice";
import { matchRemittanceBills } from "../src/lib/match-remittance-to-invoices";
import { parseLniRemittancePdf } from "../src/lib/parse-lni-remittance-pdf";
import { prisma } from "../src/lib/prisma";

async function main() {
  const remittanceNumber = process.argv[2];
  if (!remittanceNumber) {
    console.error("Usage: reimport-single-remittance.ts <remittanceNumber>");
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user found.");

  const existing = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber },
    select: {
      id: true,
      status: true,
      sourceFilename: true,
      remittanceNumber: true,
    },
  });

  const sourceFilename = existing?.sourceFilename ?? null;
  if (existing?.status === "APPLIED") {
    console.log(`Reverting applied RA ${remittanceNumber}...`);
    await revertAppliedRemittance(existing.id);
  } else if (existing) {
    console.log(`Deleting preview RA ${remittanceNumber}...`);
    await prisma.remittanceAdvice.delete({ where: { id: existing.id } });
  }

  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listLniRemittanceAdvicePdfs(accessToken);
  const file = files.find(
    (f) =>
      f.name === sourceFilename ||
      f.name.includes(remittanceNumber) ||
      (sourceFilename && f.name.includes(sourceFilename.replace(/\.pdf$/i, ""))),
  );
  if (!file) {
    throw new Error(
      `Could not find Drive PDF for RA ${remittanceNumber}${sourceFilename ? ` (${sourceFilename})` : ""}`,
    );
  }

  console.log(`Downloading ${file.name}...`);
  const buffer = await downloadLniRemittancePdf(accessToken, file);

  const parsed = await parseLniRemittancePdf(buffer);
  console.log(`Parsed ${parsed.bills.length} bill(s)`);
  for (const claim of ["BJ87697", "BM70906"]) {
    const bills = parsed.bills.filter((b) => b.claimNumber === claim);
    for (const bill of bills) {
      console.log(
        " ",
        claim,
        bill.section,
        bill.serviceLines.map((l) => `${l.procedureCode}@${l.serviceDateFrom}`).join(", "),
        bill.billTotalPayable,
      );
    }
  }

  const matches = await matchRemittanceBills(parsed.bills);

  const inv987 = await prisma.invoice.findFirst({
    where: { invoiceNumber: 987 },
    select: { id: true },
  });
  const inv988 = await prisma.invoice.findFirst({
    where: { invoiceNumber: 988 },
    select: { id: true },
  });

  for (const match of matches) {
    if (match.bill.claimNumber === "BJ87697" && match.bill.serviceLines.some((l) => l.serviceDateFrom === "2026-05-26")) {
      if (!match.matchedInvoiceId && inv987) {
        match.matchedInvoiceId = inv987.id;
        match.matchNote =
          match.matchNote ??
          "Manual match: L&I paid 90837 on RA; invoice bills 90834 same DOS";
      }
      const inv = match.matchedInvoiceId
        ? await prisma.invoice.findUnique({
            where: { id: match.matchedInvoiceId },
            select: { invoiceNumber: true },
          })
        : null;
      console.log(`BJ87697 → invoice #${inv?.invoiceNumber ?? "?"}`, match.matchNote);
    }
    if (match.bill.claimNumber === "BM70906" && match.bill.serviceLines.some((l) => l.serviceDateFrom === "2026-05-26")) {
      if (!match.matchedInvoiceId && inv988) {
        match.matchedInvoiceId = inv988.id;
        match.matchNote = match.matchNote ?? "Manual match by claim and DOS";
      }
      const inv = match.matchedInvoiceId
        ? await prisma.invoice.findUnique({
            where: { id: match.matchedInvoiceId },
            select: { invoiceNumber: true },
          })
        : null;
      console.log(`BM70906 → invoice #${inv?.invoiceNumber ?? "?"}`, match.matchNote);
    }
  }

  const { remittanceAdviceId } = await importRemittancePreview({
    parsed,
    matches,
    sourceFilename: file.name,
    importedById: admin.id,
  });
  console.log(`Created preview ${remittanceAdviceId}`);

  await applyRemittanceAdvice(remittanceAdviceId);
  console.log("Applied RA", remittanceNumber);

  for (const invNum of [987, 988]) {
    const inv = await prisma.invoice.findFirst({
      where: { invoiceNumber: invNum },
      select: { id: true, invoiceNumber: true, paymentStatus: true, lniPaidAt: true },
    });
    if (inv) {
      await reconcileInvoicePaymentStatus(inv.id);
      const updated = await prisma.invoice.findUnique({
        where: { id: inv.id },
        select: { paymentStatus: true, lniPaidAt: true },
      });
      console.log(`Invoice #${invNum}:`, updated);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
