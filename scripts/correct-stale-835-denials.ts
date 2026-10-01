/**
 * Re-section applied 835 lines that the old parser filed as in process.
 *
 * L&I stamps every claim in its 835 with CLP02 status 1, denials included, so
 * until 29519a8 no denial was ever recognised from an 835 — each was stored as
 * still in process. Where that 835 is the applied source, the invoice still reports
 * a decision L&I has already made against it, and nothing re-reads the file.
 *
 * Each line is re-derived from the file it came from and corrected only where the
 * current parser disagrees. Where that file is no longer in Drive, the PDF for the
 * same remittance is used instead, matched on the ICN. Lines whose file cannot be
 * read either way are listed and left alone rather than guessed at.
 *
 * Only the section changes. The EOB codes come from the CAS segments and were
 * always read correctly, and the money is untouched. Affected invoices are then
 * reconciled, which is what moves one to Denied — and an invoice since paid on a
 * later remittance stays paid, because payment on the later date wins.
 *
 *   npx tsx scripts/correct-stale-835-denials.ts --dry-run
 *   npx tsx scripts/correct-stale-835-denials.ts
 */
import dotenv from "dotenv";

// .env.local first: .env carries placeholder credentials.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("DATABASE_URL not set — nothing to do.");
    return;
  }
  const dryRun = process.argv.includes("--dry-run");

  // The app reads the Drive account from env and refuses when it is not connected;
  // for a maintenance script any connected admin will do.
  const configured = process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL?.trim() || "ghim@gvcounseling.com";
  const connected = await prisma.user.findFirst({
    where: { email: configured, googleDriveConnection: { isNot: null } },
    select: { email: true },
  });
  if (!connected) {
    const fallback = await prisma.user.findFirst({
      where: { role: "ADMIN", googleDriveConnection: { isNot: null } },
      select: { email: true },
    });
    if (fallback) {
      console.log(`Drive: ${configured} has no Drive connection, using ${fallback.email}.`);
      process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL = fallback.email;
    }
  }

  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { resolveLniRasFolderId } = await import("../src/lib/lni-remittance-drive");
  const { listClientFolderFilesWithLinks, downloadFileBuffer } = await import("../src/lib/google-drive");
  const { parseLniRemittance835 } = await import("../src/lib/parse-lni-remittance-835");
  const { parseLniRemittancePdf } = await import("../src/lib/parse-lni-remittance-pdf");
  const { reconcileInvoicePaymentStatus } = await import("../src/lib/remittance-advice");

  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listClientFolderFilesWithLinks(accessToken, await resolveLniRasFolderId(accessToken));

  const advices = await prisma.remittanceAdvice.findMany({
    where: { sourceFormat: "ERA_835", status: "APPLIED" },
    select: {
      id: true, remittanceNumber: true, invoiceDate: true, sourceFilename: true,
      lines: {
        where: { supersededAt: null },
        select: {
          id: true, icn: true, section: true,
          matchedInvoice: {
            select: { id: true, invoiceNumber: true, paymentStatus: true,
              therapist: { select: { lastName: true } }, client: { select: { lniClaimNumber: true } } },
          },
        },
      },
    },
    orderBy: { invoiceDate: "asc" },
  });

  const corrections: Array<{ lineId: string; icn: string; from: string; to: string; invoiceId: string | null; label: string; via: string }> = [];
  const unreadable: string[] = [];

  for (const ra of advices) {
    // Prefer the 835 itself; fall back to the PDF for the same remittance, which
    // states the section outright and shares the ICN.
    let sectionByIcn = new Map<string, string>();
    let via = "";

    const eraFile = ra.sourceFilename ? files.find((f) => f.name === ra.sourceFilename) : undefined;
    if (eraFile) {
      const parsed = parseLniRemittance835(
        await downloadFileBuffer(accessToken, { id: eraFile.id, name: eraFile.name, mimeType: eraFile.mimeType }),
        { sourceFilename: eraFile.name },
      );
      sectionByIcn = new Map(parsed.bills.map((b) => [b.icn, b.section as string]));
      via = eraFile.name;
    } else {
      const icns = new Set(ra.lines.map((l) => l.icn));
      for (const candidate of files.filter((f) => /^RemittanceAdvice_\d+_\d+\.pdf$/i.test(f.name))) {
        const parsed = await parseLniRemittancePdf(
          await downloadFileBuffer(accessToken, { id: candidate.id, name: candidate.name, mimeType: candidate.mimeType }),
        );
        const overlap = parsed.bills.filter((b) => icns.has(b.icn)).length;
        if (overlap * 2 <= Math.min(icns.size, parsed.bills.length)) continue;
        sectionByIcn = new Map(parsed.bills.map((b) => [b.icn, b.section as string]));
        via = `${candidate.name} (PDF for the same remittance)`;
        break;
      }
    }

    if (!sectionByIcn.size) {
      unreadable.push(`RA ${ra.remittanceNumber} ${ra.invoiceDate.toISOString().slice(0, 10)} (${ra.sourceFilename ?? "no filename"}): ${ra.lines.length} lines left alone`);
      continue;
    }

    for (const line of ra.lines) {
      const fresh = sectionByIcn.get(line.icn);
      if (!fresh || fresh === line.section) continue;
      const inv = line.matchedInvoice;
      corrections.push({
        lineId: line.id, icn: line.icn, from: line.section, to: fresh,
        invoiceId: inv?.id ?? null,
        label: inv ? `#${inv.invoiceNumber} ${inv.therapist.lastName} (${inv.client.lniClaimNumber}) now ${inv.paymentStatus}` : "unmatched",
        via,
      });
    }
  }

  console.log(`\nLines to re-section: ${corrections.length}`);
  for (const c of corrections) {
    console.log(`  ICN ${c.icn}  ${c.from} -> ${c.to}   ${c.label}`);
    console.log(`     from ${c.via}`);
  }
  if (unreadable.length) {
    console.log(`\nLeft alone, source not available:`);
    for (const u of unreadable) console.log(`  ${u}`);
  }

  if (dryRun || !corrections.length) {
    console.log(dryRun ? "\nDry run — nothing written." : "\nNothing to correct.");
    await prisma.$disconnect();
    return;
  }

  for (const c of corrections) {
    await prisma.remittanceAdviceLine.update({
      where: { id: c.lineId },
      data: { section: c.to as never },
    });
  }

  const invoiceIds = [...new Set(corrections.map((c) => c.invoiceId).filter((id): id is string => Boolean(id)))];
  console.log(`\nReconciling ${invoiceIds.length} invoice(s):`);
  for (const id of invoiceIds) {
    const changed = await reconcileInvoicePaymentStatus(id);
    const inv = await prisma.invoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, paymentStatus: true, lniPaidAt: true, lniEobCodes: true,
        therapist: { select: { lastName: true } } },
    });
    console.log(`  #${inv?.invoiceNumber} ${inv?.therapist.lastName}: ${inv?.paymentStatus} paid=${inv?.lniPaidAt?.toISOString().slice(0, 10) ?? "—"} eob=${JSON.stringify(inv?.lniEobCodes)}${changed ? " (changed)" : " (unchanged)"}`);
  }

  await prisma.$disconnect();
}

main();
