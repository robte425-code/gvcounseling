/**
 * Rebill Maria invoice denied on RA 14941 for wrong DOS year (2025 submitted, should be 2026).
 *
 * Denied line:
 * - BN79103 (SKYTA C) Jan 8, 2025 → 2026-01-08 — source invoice #849
 *
 * Creates new BILLED/UNPAID rebill invoice with 2026 DOS (submittedAt=null, payPeriodId=null).
 * Renames Maria Drive session folder from 2025 label to 2026 when needed.
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/fix-ra14941-wrong-year-invoices.ts [--fix]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { calendarIsoFromDate } from "../src/lib/constants";
import { getNextInvoiceNumber } from "../src/lib/invoice-numbers";
import {
  findDriveSubfolder,
  getTherapistFolderConfig,
  listClientFolderFilesWithLinks,
  listClientFolders,
  resolveTherapistFolderId,
} from "../src/lib/google-drive";
import { isMariaSessionFolderName } from "../src/lib/parse-maria-invoice-pdf";
import { getSystemDriveAccessToken } from "../src/lib/google-drive-system";
import { rematchRemittanceAdvice } from "../src/lib/remittance-advice";
import { prisma } from "../src/lib/prisma";

const REBILL_ROWS = [
  {
    sourceInvoiceNumber: 849,
    claim: "BN79103",
    rebillServiceDate: "2026-01-08",
    targetFolderLabel: "01-08-2026",
  },
] as const;

type LineItemInput = {
  procedureCode: string;
  serviceDate: Date;
  amount: number;
  units: number;
  sortOrder: number;
};

function lineItemSignature(lineItems: LineItemInput[]): string {
  return [...lineItems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(
      (li) =>
        `${li.procedureCode}:${calendarIsoFromDate(li.serviceDate)}:${li.amount}:${li.units}`,
    )
    .join("|");
}

function parseSessionFolderDate(name: string): Date | null {
  const m = name.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function findRebillDuplicate(
  clientId: string,
  excludeInvoiceId: string,
  signature: string,
): Promise<{ id: string; invoiceNumber: number } | null> {
  const candidates = await prisma.invoice.findMany({
    where: {
      clientId,
      id: { not: excludeInvoiceId },
      status: "BILLED",
      submittedAt: null,
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  for (const candidate of candidates) {
    const candidateSignature = lineItemSignature(
      candidate.lineItems.map((li) => ({
        procedureCode: li.procedureCode,
        serviceDate: li.serviceDate,
        amount: Number(li.amount),
        units: li.units,
        sortOrder: li.sortOrder,
      })),
    );
    if (candidateSignature === signature) {
      return { id: candidate.id, invoiceNumber: candidate.invoiceNumber };
    }
  }
  return null;
}

async function renameDriveFile(accessToken: string, fileId: string, newName: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive rename failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

async function fixDriveSessionFolders(
  fix: boolean,
): Promise<{ claim: string; from: string; to: string; action: string }[]> {
  const results: { claim: string; from: string; to: string; action: string }[] = [];
  const { accessToken } = await getSystemDriveAccessToken();
  const cfg = getTherapistFolderConfig().maria;
  const parentId = await resolveTherapistFolderId(accessToken, cfg.folderId, cfg.folderName);

  const sources: { folders: Awaited<ReturnType<typeof listClientFolders>> }[] = [
    { folders: await listClientFolders(accessToken, parentId) },
  ];
  const closed = await findDriveSubfolder(
    accessToken,
    parentId,
    cfg.closedSubfolderName ?? "Closed Cases",
  );
  if (closed) {
    sources.push({ folders: await listClientFolders(accessToken, closed.id) });
  }

  for (const row of REBILL_ROWS) {
    const targetDate = new Date(`${row.rebillServiceDate}T00:00:00.000Z`);
    const wrongYearDate = new Date(targetDate);
    wrongYearDate.setUTCFullYear(2025);

    let clientFolderId: string | null = null;
    for (const source of sources) {
      const match = source.folders.find((f) => f.name.startsWith(`${row.claim} `));
      if (match) {
        clientFolderId = match.id;
        break;
      }
    }
    if (!clientFolderId) {
      results.push({
        claim: row.claim,
        from: "(missing)",
        to: row.targetFolderLabel,
        action: "client folder not found",
      });
      continue;
    }

    const children = await listClientFolderFilesWithLinks(accessToken, clientFolderId);
    const sessionFolders = children.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder" && isMariaSessionFolderName(f.name),
    );

    const correctFolder = sessionFolders.find((f) => f.name === row.targetFolderLabel);
    const wrongFolders = sessionFolders.filter((f) => {
      const parsed = parseSessionFolderDate(f.name);
      return parsed && sameCalendarDay(parsed, wrongYearDate) && f.name !== row.targetFolderLabel;
    });

    if (correctFolder) {
      results.push({
        claim: row.claim,
        from: correctFolder.name,
        to: row.targetFolderLabel,
        action: "already correct",
      });
      continue;
    }

    if (wrongFolders.length === 0) {
      const nearMatch = sessionFolders
        .map((f) => ({ f, parsed: parseSessionFolderDate(f.name) }))
        .filter((x) => x.parsed && sameCalendarDay(x.parsed, targetDate));
      if (nearMatch.length) {
        results.push({
          claim: row.claim,
          from: nearMatch[0]!.f.name,
          to: row.targetFolderLabel,
          action: nearMatch[0]!.f.name === row.targetFolderLabel ? "already correct" : "normalize name",
        });
        if (fix && nearMatch[0]!.f.name !== row.targetFolderLabel) {
          await renameDriveFile(accessToken, nearMatch[0]!.f.id, row.targetFolderLabel);
          results[results.length - 1]!.action = "renamed";
        }
      } else {
        results.push({
          claim: row.claim,
          from: "(not found)",
          to: row.targetFolderLabel,
          action: "no session folder for Jan date",
        });
      }
      continue;
    }

    for (const folder of wrongFolders) {
      results.push({
        claim: row.claim,
        from: folder.name,
        to: row.targetFolderLabel,
        action: fix ? "renamed" : "would rename",
      });
      if (fix) {
        await renameDriveFile(accessToken, folder.id, row.targetFolderLabel);
      }
    }
  }

  return results;
}

async function main() {
  const fix = process.argv.includes("--fix");

  const maria = await prisma.user.findFirst({
    where: { email: "maria@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!maria) throw new Error("Maria therapist not found.");

  console.log(fix ? "FIX MODE" : "DRY RUN");
  console.log("RA 14941 wrong-year rebill: create 2026 DOS invoice for BN79103\n");

  const created: { claim: string; source: number; invoiceNumber: number; serviceDate: string }[] = [];
  const skipped: { claim: string; source: number; reason: string }[] = [];

  for (const row of REBILL_ROWS) {
    const source = await prisma.invoice.findFirst({
      where: { therapistId: maria.id, invoiceNumber: row.sourceInvoiceNumber },
      include: {
        client: { select: { id: true, lniClaimNumber: true, firstName: true, lastName: true } },
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!source) throw new Error(`Source invoice #${row.sourceInvoiceNumber} not found.`);
    if (source.client.lniClaimNumber !== row.claim) {
      throw new Error(
        `#${row.sourceInvoiceNumber} claim mismatch: ${source.client.lniClaimNumber} (expected ${row.claim})`,
      );
    }

    const rebillDate = new Date(`${row.rebillServiceDate}T00:00:00.000Z`);
    const lineItems: LineItemInput[] = source.lineItems.map((li) => ({
      procedureCode: li.procedureCode,
      serviceDate: rebillDate,
      amount: Number(li.amount),
      units: li.units,
      sortOrder: li.sortOrder,
    }));
    const signature = lineItemSignature(lineItems);
    const codes = lineItems.map((li) => li.procedureCode).join("+");

    console.log(
      `#${row.sourceInvoiceNumber} ${row.claim} (${source.client.firstName} ${source.client.lastName})`,
    );
    console.log(
      `  source DOS: ${[...new Set(source.lineItems.map((li) => calendarIsoFromDate(li.serviceDate)))].join(", ")}`,
    );
    console.log(
      `  rebill DOS: ${row.rebillServiceDate} ${codes} $${Number(source.totalAmount)} (billed ${calendarIsoFromDate(source.billedAt!)})`,
    );
    console.log(
      `  source submitted: ${source.submittedAt ? calendarIsoFromDate(source.submittedAt) : "null"} payPeriod: ${source.payPeriodId ?? "null"}`,
    );

    const duplicate = await findRebillDuplicate(source.client.id, source.id, signature);
    if (duplicate) {
      const reason = `unsubmitted rebill already exists: #${duplicate.invoiceNumber}`;
      console.log(`  SKIP: ${reason}`);
      skipped.push({ claim: row.claim, source: row.sourceInvoiceNumber, reason });
      console.log("");
      continue;
    }

    const nextNumber = await getNextInvoiceNumber(prisma, maria.id);
    console.log(`  CREATE rebill #${nextNumber} BILLED/UNPAID (submittedAt=null, payPeriodId=null)`);
    created.push({
      claim: row.claim,
      source: row.sourceInvoiceNumber,
      invoiceNumber: nextNumber,
      serviceDate: row.rebillServiceDate,
    });

    if (fix) {
      await prisma.invoice.create({
        data: {
          therapistId: maria.id,
          clientId: source.client.id,
          invoiceNumber: nextNumber,
          status: "BILLED",
          paymentStatus: "UNPAID",
          lniPaidAt: null,
          lniEobCodes: [],
          lniEobCodeDescriptions: {},
          totalAmount: Number(source.totalAmount),
          billedAt: source.billedAt,
          submittedAt: null,
          payPeriodId: null,
          lineItems: {
            create: lineItems.map((line) => ({
              serviceDate: line.serviceDate,
              procedureCode: line.procedureCode,
              amount: line.amount,
              units: line.units,
              sortOrder: line.sortOrder,
            })),
          },
        },
      });
    }
    console.log("");
  }

  console.log("Drive session folders:");
  try {
    const folderResults = await fixDriveSessionFolders(fix);
    for (const r of folderResults) {
      console.log(`  ${r.claim}: ${r.from} → ${r.to} (${r.action})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  Drive check skipped: ${message}`);
  }
  console.log("");

  const previewRas = await prisma.remittanceAdvice.findMany({
    where: {
      status: "PREVIEW",
      lines: { some: { claimNumber: { in: REBILL_ROWS.map((r) => r.claim) } } },
    },
    select: { id: true, remittanceNumber: true },
    orderBy: { remittanceNumber: "asc" },
  });

  console.log(
    `Preview RAs to rematch (${previewRas.length}):`,
    previewRas.map((r) => r.remittanceNumber).join(", "),
  );

  if (fix) {
    for (const ra of previewRas) {
      await rematchRemittanceAdvice(ra.id);
      console.log(`  rematched RA ${ra.remittanceNumber}`);
    }
  }

  if (created.length) {
    console.log("\nRebill invoices:");
    for (const c of created) {
      console.log(`  #${c.invoiceNumber} ${c.claim} DOS ${c.serviceDate} (from #${c.source})`);
    }
  }

  if (skipped.length) {
    console.log("\nSkipped:");
    for (const s of skipped) {
      console.log(`  #${s.source} ${s.claim}: ${s.reason}`);
    }
  }

  const ra14941 = await prisma.remittanceAdvice.findFirst({
    where: { remittanceNumber: "14941" },
    include: {
      lines: {
        where: { claimNumber: { in: REBILL_ROWS.map((r) => r.claim) } },
        include: {
          matchedInvoice: { select: { invoiceNumber: true, paymentStatus: true } },
        },
      },
    },
  });

  if (ra14941) {
    console.log("\nRA 14941 line matches" + (fix ? " after fix" : " (current)") + ":");
    for (const line of ra14941.lines) {
      const sl = line.serviceLines as { procedureCode: string; serviceDateFrom: string }[];
      const dos = sl.map((s) => `${s.procedureCode}:${s.serviceDateFrom}`).join(", ");
      const denied2025 = sl.some((s) => s.serviceDateFrom.startsWith("2025-01-0"));
      if (!denied2025 && line.section !== "DENIED") continue;
      console.log(
        `  ${line.section} ${line.claimNumber} ${dos} ->`,
        line.matchedInvoice
          ? `#${line.matchedInvoice.invoiceNumber} (${line.matchedInvoice.paymentStatus})`
          : "UNMATCHED",
        line.matchNote ? `[${line.matchNote}]` : "",
      );
    }
  }

  if (!fix) {
    console.log("\nDry run. Re-run with --fix to apply.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
