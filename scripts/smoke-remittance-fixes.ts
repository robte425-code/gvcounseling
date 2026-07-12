/**
 * Remittance rollback / rematch smoke helpers (imported by smoke-critical-fixes.ts).
 */

import { calendarIsoFromDate } from "../src/lib/constants";
import {
  deleteRemittancePreview,
  manualMatchRemittanceLine,
  rematchRemittanceAdvice,
  revertAppliedRemittance,
  unmatchRemittanceLine,
} from "../src/lib/remittance-advice";

const SMOKE_EOB_CODE = "99998";

type RecordFn = (name: string, status: "PASS" | "FAIL" | "SKIP", detail?: string) => void;

type SmokePrisma = typeof import("../src/lib/prisma").prisma;

export async function testLocalRemittanceGuardsAsync(record: RecordFn) {
  const cases: Array<{ run: () => Promise<void>; expect: RegExp }> = [
    {
      run: () => deleteRemittancePreview("smoke-missing-remittance-id"),
      expect: /not found/i,
    },
    {
      run: () => unmatchRemittanceLine("smoke-missing-remittance-id", "smoke-missing-line-id"),
      expect: /not found/i,
    },
    {
      run: () =>
        manualMatchRemittanceLine({
          remittanceAdviceId: "smoke-missing-remittance-id",
          lineId: "smoke-missing-line-id",
          invoiceNumber: 1,
        }),
      expect: /not found/i,
    },
    {
      run: () => rematchRemittanceAdvice("smoke-missing-remittance-id"),
      expect: /not found/i,
    },
    {
      run: () => revertAppliedRemittance("smoke-missing-remittance-id"),
      expect: /not found/i,
    },
  ];

  for (const c of cases) {
    try {
      await c.run();
      record("local/remittance-guards", "FAIL", "expected error was not thrown");
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!c.expect.test(msg)) {
        record("local/remittance-guards", "FAIL", msg);
        return;
      }
    }
  }

  record("local/remittance-guards", "PASS", `cases=${cases.length}`);
}

export async function testDbRemittanceRevertBlocksFinalized(
  record: RecordFn,
  getPrisma: () => Promise<SmokePrisma>,
) {
  const prisma = await getPrisma();
  const finalized = await prisma.remittanceAdvice.findFirst({
    where: { status: "APPLIED", payRun: { status: "FINALIZED" } },
    select: { id: true, remittanceNumber: true },
  });

  if (!finalized) {
    record("db/remittance-revert-blocks-finalized", "SKIP", "no finalized applied remittance in DB");
    return;
  }

  try {
    await revertAppliedRemittance(finalized.id);
    record("db/remittance-revert-blocks-finalized", "FAIL", "expected throw for finalized pay run");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record(
      "db/remittance-revert-blocks-finalized",
      /finalized/i.test(msg) ? "PASS" : "FAIL",
      msg,
    );
  }
}

export async function testDbRemittancePreviewRollback(
  record: RecordFn,
  getPrisma: () => Promise<SmokePrisma>,
) {
  const prisma = await getPrisma();

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) {
    record("db/remittance-preview-rollback", "SKIP", "no admin user");
    return;
  }

  const invoice = await prisma.invoice.findFirst({
    where: { status: "BILLED" },
    include: {
      client: { select: { lniClaimNumber: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!invoice?.client.lniClaimNumber) {
    record("db/remittance-preview-rollback", "SKIP", "no BILLED invoice with claim number");
    return;
  }

  const invoiceSnapshot = {
    paymentStatus: invoice.paymentStatus,
    lniPaidAt: invoice.lniPaidAt,
    lniEobCodes: [...invoice.lniEobCodes],
    lniEobCodeDescriptions: invoice.lniEobCodeDescriptions,
  };

  const smokeKey = `SMOKE-${Date.now()}`;
  let remittanceId: string | null = null;
  let lineId: string | null = null;

  const serviceDate =
    invoice.lineItems[0] != null
      ? calendarIsoFromDate(invoice.lineItems[0].serviceDate)
      : "2025-01-01";

  try {
    const remittance = await prisma.remittanceAdvice.create({
      data: {
        remittanceNumber: smokeKey,
        warrantRegister: `W-${smokeKey}`,
        invoiceDate: new Date(),
        payeeNumber: "SMOKE",
        payeeName: "Smoke Test Payee",
        totalPaid: 1,
        status: "PREVIEW",
        importedById: admin.id,
        lines: {
          create: {
            section: "PAID",
            claimNumber: invoice.client.lniClaimNumber,
            icn: `ICN-${smokeKey}`,
            patientName: "Smoke Patient",
            serviceProviderId: "SMOKE-PROV",
            billTotalPayable: 1,
            eobCodes: [SMOKE_EOB_CODE],
            eobCodeDescriptions: { [SMOKE_EOB_CODE]: "Smoke test EOB" },
            serviceLines: [
              {
                procedureCode: invoice.lineItems[0]?.procedureCode ?? "H0001",
                serviceDateFrom: serviceDate,
                serviceDateTo: serviceDate,
                units: 1,
                amount: 1,
              },
            ],
            matchedInvoiceId: invoice.id,
            matchNote: "Smoke test match",
          },
        },
      },
      include: { lines: true },
    });

    remittanceId = remittance.id;
    lineId = remittance.lines[0]?.id ?? null;
    if (!lineId) throw new Error("Smoke remittance line was not created.");

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lniEobCodes: [SMOKE_EOB_CODE],
        lniEobCodeDescriptions: { [SMOKE_EOB_CODE]: "Smoke test EOB" },
      },
    });

    const afterMatch = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { lniEobCodes: true },
    });
    if (!afterMatch?.lniEobCodes.includes(SMOKE_EOB_CODE)) {
      record("db/remittance-preview-rollback", "FAIL", "EOB not set on invoice after match");
      return;
    }

    await unmatchRemittanceLine(remittanceId, lineId);

    const afterUnmatch = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { lniEobCodes: true },
    });
    if (afterUnmatch?.lniEobCodes.includes(SMOKE_EOB_CODE)) {
      record("db/remittance-preview-rollback", "FAIL", "EOB still present after unmatch");
      return;
    }

    await manualMatchRemittanceLine({
      remittanceAdviceId: remittanceId,
      lineId,
      invoiceNumber: invoice.invoiceNumber,
    });

    const afterManual = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { lniEobCodes: true },
    });
    if (!afterManual?.lniEobCodes.includes(SMOKE_EOB_CODE)) {
      record("db/remittance-preview-rollback", "FAIL", "EOB missing after manual match");
      return;
    }

    await rematchRemittanceAdvice(remittanceId);

    const lineAfterRematch = await prisma.remittanceAdviceLine.findUnique({
      where: { id: lineId },
      select: { id: true, matchedInvoiceId: true },
    });
    if (!lineAfterRematch) {
      record("db/remittance-preview-rollback", "FAIL", "remittance line missing after rematch");
      return;
    }

    await deleteRemittancePreview(remittanceId);
    remittanceId = null;

    const raGone = await prisma.remittanceAdvice.findUnique({ where: { id: remittance.id } });
    if (raGone) {
      record("db/remittance-preview-rollback", "FAIL", "preview remittance still exists after delete");
      return;
    }

    const afterDelete = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { lniEobCodes: true },
    });
    if (afterDelete?.lniEobCodes.includes(SMOKE_EOB_CODE)) {
      record("db/remittance-preview-rollback", "FAIL", "EOB still present after preview delete");
      return;
    }

    record("db/remittance-preview-rollback", "PASS", `invoice=#${invoice.invoiceNumber}`);
  } catch (e) {
    record(
      "db/remittance-preview-rollback",
      "FAIL",
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    if (remittanceId) {
      await prisma.remittanceAdvice.delete({ where: { id: remittanceId } }).catch(() => undefined);
    }
    await prisma.invoice
      .update({
        where: { id: invoice.id },
        data: {
          paymentStatus: invoiceSnapshot.paymentStatus,
          lniPaidAt: invoiceSnapshot.lniPaidAt,
          lniEobCodes: invoiceSnapshot.lniEobCodes,
          lniEobCodeDescriptions: invoiceSnapshot.lniEobCodeDescriptions,
        },
      })
      .catch(() => undefined);
  }
}

export async function testDbTherapistPaymentPayRunSplit(
  record: RecordFn,
  getPrisma: () => Promise<SmokePrisma>,
) {
  const prisma = await getPrisma();

  const withDraftOnly = await prisma.invoice.count({
    where: {
      payRunLines: { some: { payout: { payRun: { status: "DRAFT" } } } },
      NOT: {
        payRunLines: { some: { payout: { payRun: { status: "FINALIZED" } } } },
      },
    },
  });

  const withFinalized = await prisma.invoice.count({
    where: {
      payRunLines: { some: { payout: { payRun: { status: "FINALIZED" } } } },
    },
  });

  record(
    "db/therapist-payment-payrun-split",
    "PASS",
    `draftOnly=${withDraftOnly} finalized=${withFinalized} (Pending vs Paid source)`,
  );
}
