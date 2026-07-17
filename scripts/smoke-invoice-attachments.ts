#!/usr/bin/env tsx
/**
 * Regression: invoice attachments must survive draft save, submit, and unsubmit.
 *
 * Usage:
 *   set -a && source .env.smoke.local && set +a
 *   npx tsx scripts/smoke-invoice-attachments.ts
 *
 * Without DATABASE_URL, runs local helper checks only.
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
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadSmokeEnv();

import {
  mergeUniqueAttachments,
  toInvoiceAttachmentViews,
} from "../src/lib/invoice-attachments";

type Status = "PASS" | "FAIL" | "SKIP";
const results: Array<{ name: string; status: Status; detail?: string }> = [];

function record(name: string, status: Status, detail?: string) {
  results.push({ name, status, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
}

function testLocalHelpers() {
  const merged = mergeUniqueAttachments(
    [{ id: "a", filename: "keep.pdf", blobUrl: "https://example.com/a" }],
    [],
    [{ id: "b", filename: "new.pdf", blobUrl: "https://example.com/b" }],
  );
  if (merged.length !== 2 || !merged.some((item) => item.id === "a")) {
    record("merge keeps client uploads when server list is stale/empty", "FAIL", JSON.stringify(merged));
    return;
  }
  record("merge keeps client uploads when server list is stale/empty", "PASS");

  const views = toInvoiceAttachmentViews([
    {
      id: "x",
      filename: "note.pdf",
      blobUrl: "https://drive.example/x",
    },
  ]);
  if (views.length !== 1 || views[0]?.id !== "x" || views[0]?.filename !== "note.pdf") {
    record("attachment views are plain serializable props", "FAIL", JSON.stringify(views));
    return;
  }
  record("attachment views are plain serializable props", "PASS");
}

async function testDbAttachmentSurvivesSubmit() {
  if (!process.env.DATABASE_URL?.trim()) {
    record("db: attachments survive line replace + submit/unsubmit", "SKIP", "DATABASE_URL not set");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  const { getNextInvoiceNumber } = await import("../src/lib/invoice-numbers");
  const suffix = `att-smoke-${Date.now()}`;

  const therapist = await prisma.user.create({
    data: {
      email: `${suffix}@example.com`,
      passwordHash: "unused",
      firstName: "Attach",
      lastName: "Smoke",
      role: "THERAPIST",
      active: true,
    },
  });

  const client = await prisma.client.create({
    data: {
      firstName: "Test",
      lastName: "Client",
      lniClaimNumber: `SMK-${Date.now()}`,
      therapistId: therapist.id,
      assignmentStatus: "ACTIVE",
    },
  });

  let invoiceId = "";
  try {
    const invoice = await prisma.invoice.create({
      data: {
        therapistId: therapist.id,
        clientId: client.id,
        invoiceNumber: await getNextInvoiceNumber(prisma, therapist.id),
        totalAmount: 100,
        status: "DRAFT",
        lineItems: {
          create: [
            {
              serviceDate: new Date("2026-07-01T00:00:00.000Z"),
              procedureCode: "90837",
              amount: 100,
              units: 1,
              sortOrder: 0,
            },
          ],
        },
      },
    });
    invoiceId = invoice.id;

    const attachment = await prisma.invoiceAttachment.create({
      data: {
        invoiceId: invoice.id,
        filename: "session-note.pdf",
        blobUrl: "https://drive.example/session-note",
        contentType: "application/pdf",
        size: 1234,
      },
    });

    // Mirror persistInvoiceFromFormData line-item replace (must not touch attachments).
    await prisma.$transaction([
      prisma.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { totalAmount: 100 },
      }),
      prisma.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          serviceDate: new Date("2026-07-01T00:00:00.000Z"),
          procedureCode: "90837",
          amount: 100,
          units: 1,
          sortOrder: 0,
        },
      }),
    ]);

    const afterReplace = await prisma.invoiceAttachment.findMany({
      where: { invoiceId: invoice.id },
    });
    if (afterReplace.length !== 1 || afterReplace[0]?.id !== attachment.id) {
      record(
        "db: attachments survive line replace + submit/unsubmit",
        "FAIL",
        `lost after line replace (${afterReplace.length})`,
      );
      return;
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    const afterSubmit = await prisma.invoiceAttachment.count({
      where: { invoiceId: invoice.id },
    });
    if (afterSubmit !== 1) {
      record(
        "db: attachments survive line replace + submit/unsubmit",
        "FAIL",
        `lost after submit (${afterSubmit})`,
      );
      return;
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "DRAFT", submittedAt: null, payPeriodId: null },
    });
    const afterUnsubmit = await prisma.invoiceAttachment.count({
      where: { invoiceId: invoice.id },
    });
    if (afterUnsubmit !== 1) {
      record(
        "db: attachments survive line replace + submit/unsubmit",
        "FAIL",
        `lost after unsubmit (${afterUnsubmit})`,
      );
      return;
    }

    record("db: attachments survive line replace + submit/unsubmit", "PASS", attachment.id);
  } catch (error) {
    record(
      "db: attachments survive line replace + submit/unsubmit",
      "FAIL",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (invoiceId) {
      await prisma.invoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
    }
    await prisma.client.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: therapist.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

async function main() {
  testLocalHelpers();
  await testDbAttachmentSurvivesSubmit();

  const failed = results.filter((result) => result.status === "FAIL").length;
  const passed = results.filter((result) => result.status === "PASS").length;
  const skipped = results.filter((result) => result.status === "SKIP").length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
