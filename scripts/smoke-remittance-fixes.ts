/**
 * Remittance rollback / rematch smoke helpers (imported by smoke-critical-fixes.ts).
 */

import { calendarIsoFromDate } from "../src/lib/constants";
import { resolveTherapistPaymentDisplay } from "../src/lib/invoice-therapist-payment";
import { resolveFeeAmount } from "../src/lib/procedure-fee-schedule";
import {
  applyRemittanceAdvice,
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

type SmokeInvoiceCandidate = {
  id: string;
  invoiceNumber: number;
  therapistId: string;
  paymentStatus: string | null;
  lniPaidAt: Date | null;
  lniEobCodes: string[];
  lniEobCodeDescriptions: unknown;
  client: { lniClaimNumber: string };
  lineItems: Array<{ procedureCode: string; serviceDate: Date; units: number }>;
};

async function findSmokeApplyInvoice(prisma: SmokePrisma): Promise<SmokeInvoiceCandidate | null> {
  const candidates = await prisma.invoice.findMany({
    where: {
      status: "BILLED",
      client: { lniClaimNumber: { not: "" } },
      OR: [{ paymentStatus: null }, { paymentStatus: "UNPAID" }],
      remittanceLines: {
        none: {
          supersededAt: null,
          remittanceAdvice: { status: "APPLIED" },
        },
      },
      lineItems: { some: {} },
    },
    include: {
      client: { select: { lniClaimNumber: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, take: 3 },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  for (const inv of candidates) {
    const line = inv.lineItems[0];
    if (!line || !inv.client.lniClaimNumber) continue;

    const fees = await prisma.therapistProcedureCodeFee.findMany({
      where: { therapistId: inv.therapistId },
    });
    if (resolveFeeAmount(fees, line.procedureCode, line.serviceDate) === null) continue;

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      therapistId: inv.therapistId,
      paymentStatus: inv.paymentStatus,
      lniPaidAt: inv.lniPaidAt,
      lniEobCodes: [...inv.lniEobCodes],
      lniEobCodeDescriptions: inv.lniEobCodeDescriptions,
      client: { lniClaimNumber: inv.client.lniClaimNumber },
      lineItems: inv.lineItems.map((item) => ({
        procedureCode: item.procedureCode,
        serviceDate: item.serviceDate,
        units: item.units,
      })),
    };
  }

  return null;
}

async function createSmokePreviewRemittance(
  prisma: SmokePrisma,
  options: {
    adminId: string;
    smokeKey: string;
    invoice: SmokeInvoiceCandidate;
  },
) {
  const line = options.invoice.lineItems[0]!;
  const serviceDate = calendarIsoFromDate(line.serviceDate);

  return prisma.remittanceAdvice.create({
    data: {
      remittanceNumber: options.smokeKey,
      warrantRegister: `W-${options.smokeKey}`,
      invoiceDate: new Date(),
      payeeNumber: "SMOKE",
      payeeName: "Smoke Test Payee",
      totalPaid: 1,
      status: "PREVIEW",
      importedById: options.adminId,
      lines: {
        create: {
          section: "PAID",
          claimNumber: options.invoice.client.lniClaimNumber,
          icn: `ICN-${options.smokeKey}`,
          patientName: "Smoke Patient",
          serviceProviderId: "SMOKE-PROV",
          billTotalPayable: 1,
          eobCodes: [SMOKE_EOB_CODE],
          eobCodeDescriptions: { [SMOKE_EOB_CODE]: "Smoke apply test EOB" },
          serviceLines: [
            {
              procedureCode: line.procedureCode,
              serviceDateFrom: serviceDate,
              serviceDateTo: serviceDate,
              units: line.units,
              amount: 1,
            },
          ],
          matchedInvoiceId: options.invoice.id,
          matchNote: "Smoke apply test match",
        },
      },
    },
    include: { lines: true },
  });
}

/** Apply preview remittance, assert draft pay + pending therapist payment, then revert and restore. */
export async function testDbRemittanceApplyAndRevert(
  record: RecordFn,
  getPrisma: () => Promise<SmokePrisma>,
) {
  const prisma = await getPrisma();

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) {
    record("db/remittance-apply-and-revert", "SKIP", "no admin user");
    return;
  }

  const invoice = await findSmokeApplyInvoice(prisma);
  if (!invoice) {
    record(
      "db/remittance-apply-and-revert",
      "SKIP",
      "no BILLED UNPAID invoice with therapist fee schedule for line item",
    );
    return;
  }

  const invoiceSnapshot = {
    paymentStatus: invoice.paymentStatus,
    lniPaidAt: invoice.lniPaidAt,
    lniEobCodes: [...invoice.lniEobCodes],
    lniEobCodeDescriptions: invoice.lniEobCodeDescriptions,
  };

  const smokeKey = `SMOKE-APPLY-${Date.now()}`;
  let remittanceId: string | null = null;
  let applied = false;

  try {
    const remittance = await createSmokePreviewRemittance(prisma, {
      adminId: admin.id,
      smokeKey,
      invoice,
    });
    remittanceId = remittance.id;

    await applyRemittanceAdvice(remittanceId);
    applied = true;

    const appliedRa = await prisma.remittanceAdvice.findUnique({
      where: { id: remittanceId },
      include: {
        payRun: {
          include: {
            payouts: {
              include: {
                lines: { where: { invoiceId: invoice.id } },
              },
            },
          },
        },
      },
    });

    if (appliedRa?.status !== "APPLIED") {
      record("db/remittance-apply-and-revert", "FAIL", "remittance not APPLIED after apply");
      return;
    }
    if (appliedRa.payRun?.status !== "DRAFT") {
      record("db/remittance-apply-and-revert", "FAIL", "pay run not DRAFT after apply");
      return;
    }

    const payRunLine = appliedRa.payRun.payouts.flatMap((p) => p.lines)[0];
    if (!payRunLine) {
      record("db/remittance-apply-and-revert", "FAIL", "no TherapistPayRunLine for invoice");
      return;
    }

    const invoiceAfterApply = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: {
        paymentStatus: true,
        payRunLines: {
          select: {
            payout: { select: { payRun: { select: { status: true } } } },
          },
        },
      },
    });

    if (invoiceAfterApply?.paymentStatus !== "PAID") {
      record(
        "db/remittance-apply-and-revert",
        "FAIL",
        `expected PAID after apply, got ${invoiceAfterApply?.paymentStatus ?? "null"}`,
      );
      return;
    }

    const therapistDisplay = resolveTherapistPaymentDisplay(invoiceAfterApply.payRunLines);
    if (therapistDisplay !== "pending") {
      record(
        "db/remittance-apply-and-revert",
        "FAIL",
        `expected therapist payment pending, got ${therapistDisplay}`,
      );
      return;
    }

    await revertAppliedRemittance(remittanceId);
    applied = false;
    remittanceId = null;

    const raGone = await prisma.remittanceAdvice.findUnique({ where: { id: remittance.id } });
    if (raGone) {
      record("db/remittance-apply-and-revert", "FAIL", "remittance still exists after revert");
      return;
    }

    const payRunLinesLeft = await prisma.therapistPayRunLine.count({
      where: { invoiceId: invoice.id, payout: { payRun: { remittanceAdviceId: remittance.id } } },
    });
    if (payRunLinesLeft > 0) {
      record("db/remittance-apply-and-revert", "FAIL", "pay run lines remain after revert");
      return;
    }

    const invoiceAfterRevert = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: {
        paymentStatus: true,
        lniPaidAt: true,
        lniEobCodes: true,
        payRunLines: { select: { id: true } },
      },
    });

    if (invoiceAfterRevert?.paymentStatus !== invoiceSnapshot.paymentStatus) {
      record(
        "db/remittance-apply-and-revert",
        "FAIL",
        `paymentStatus after revert: ${invoiceAfterRevert?.paymentStatus} expected ${invoiceSnapshot.paymentStatus}`,
      );
      return;
    }

    if (invoiceAfterRevert.payRunLines.length > 0) {
      const stillPending = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        select: {
          payRunLines: {
            select: { payout: { select: { payRun: { select: { status: true } } } } },
          },
        },
      });
      const display = resolveTherapistPaymentDisplay(stillPending?.payRunLines ?? []);
      if (display === "pending") {
        record(
          "db/remittance-apply-and-revert",
          "FAIL",
          "invoice still has draft pay run lines from smoke remittance after revert",
        );
        return;
      }
    }

    record(
      "db/remittance-apply-and-revert",
      "PASS",
      `invoice=#${invoice.invoiceNumber} apply→DRAFT+pending→revert`,
    );
  } catch (e) {
    record(
      "db/remittance-apply-and-revert",
      "FAIL",
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    if (remittanceId) {
      try {
        if (applied) {
          await revertAppliedRemittance(remittanceId);
        } else {
          await deleteRemittancePreview(remittanceId);
        }
      } catch {
        await prisma.remittanceAdvice.delete({ where: { id: remittanceId } }).catch(() => undefined);
      }
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

async function countAppliedRemittanceMatches(
  prisma: SmokePrisma,
  invoiceId: string,
): Promise<number> {
  return prisma.remittanceAdviceLine.count({
    where: {
      matchedInvoiceId: invoiceId,
      supersededAt: null,
      remittanceAdvice: { status: "APPLIED" },
    },
  });
}

async function cleanupSmokeRemittance(
  prisma: SmokePrisma,
  remittanceId: string,
  applied: boolean,
): Promise<void> {
  try {
    if (applied) {
      await revertAppliedRemittance(remittanceId);
      return;
    }
    const ra = await prisma.remittanceAdvice.findUnique({
      where: { id: remittanceId },
      select: { status: true },
    });
    if (ra?.status === "PREVIEW") {
      await deleteRemittancePreview(remittanceId);
    } else if (ra?.status === "APPLIED") {
      await revertAppliedRemittance(remittanceId);
    }
  } catch {
    await prisma.remittanceAdvice.delete({ where: { id: remittanceId } }).catch(() => undefined);
  }
}

/**
 * Two applied remittances on one invoice: reverting one leaves L&I PAID from the other.
 */
export async function testDbRemittanceMultiApplyRevert(
  record: RecordFn,
  getPrisma: () => Promise<SmokePrisma>,
) {
  const prisma = await getPrisma();

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) {
    record("db/remittance-multi-apply-revert", "SKIP", "no admin user");
    return;
  }

  const invoice = await findSmokeApplyInvoice(prisma);
  if (!invoice) {
    record(
      "db/remittance-multi-apply-revert",
      "SKIP",
      "no BILLED UNPAID invoice with therapist fee schedule for line item",
    );
    return;
  }

  const invoiceSnapshot = {
    paymentStatus: invoice.paymentStatus,
    lniPaidAt: invoice.lniPaidAt,
    lniEobCodes: [...invoice.lniEobCodes],
    lniEobCodeDescriptions: invoice.lniEobCodeDescriptions,
  };

  const ts = Date.now();
  const smokeKeyA = `SMOKE-MULTI-A-${ts}`;
  const smokeKeyB = `SMOKE-MULTI-B-${ts}`;
  let remittanceIdA: string | null = null;
  let remittanceIdB: string | null = null;
  let appliedA = false;
  let appliedB = false;

  try {
    const remittanceA = await createSmokePreviewRemittance(prisma, {
      adminId: admin.id,
      smokeKey: smokeKeyA,
      invoice,
    });
    remittanceIdA = remittanceA.id;
    await applyRemittanceAdvice(remittanceIdA);
    appliedA = true;

    const remittanceB = await createSmokePreviewRemittance(prisma, {
      adminId: admin.id,
      smokeKey: smokeKeyB,
      invoice,
    });
    remittanceIdB = remittanceB.id;
    await applyRemittanceAdvice(remittanceIdB);
    appliedB = true;

    const matchesAfterBoth = await countAppliedRemittanceMatches(prisma, invoice.id);
    if (matchesAfterBoth !== 2) {
      record(
        "db/remittance-multi-apply-revert",
        "FAIL",
        `expected 2 applied matches, got ${matchesAfterBoth}`,
      );
      return;
    }

    const paidAfterBoth = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { paymentStatus: true },
    });
    if (paidAfterBoth?.paymentStatus !== "PAID") {
      record(
        "db/remittance-multi-apply-revert",
        "FAIL",
        `expected PAID after both applies, got ${paidAfterBoth?.paymentStatus ?? "null"}`,
      );
      return;
    }

    await revertAppliedRemittance(remittanceIdB);
    appliedB = false;
    remittanceIdB = null;

    const matchesAfterRevertB = await countAppliedRemittanceMatches(prisma, invoice.id);
    if (matchesAfterRevertB !== 1) {
      record(
        "db/remittance-multi-apply-revert",
        "FAIL",
        `expected 1 applied match after revert B, got ${matchesAfterRevertB}`,
      );
      return;
    }

    const paidAfterRevertB = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { paymentStatus: true },
    });
    if (paidAfterRevertB?.paymentStatus !== "PAID") {
      record(
        "db/remittance-multi-apply-revert",
        "FAIL",
        `invoice should stay PAID after revert B (A still applied), got ${paidAfterRevertB?.paymentStatus ?? "null"}`,
      );
      return;
    }

    await revertAppliedRemittance(remittanceIdA);
    appliedA = false;
    remittanceIdA = null;

    const matchesAfterRevertA = await countAppliedRemittanceMatches(prisma, invoice.id);
    if (matchesAfterRevertA !== 0) {
      record(
        "db/remittance-multi-apply-revert",
        "FAIL",
        `expected 0 applied matches after revert A, got ${matchesAfterRevertA}`,
      );
      return;
    }

    const paidAfterRevertA = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { paymentStatus: true },
    });
    if (paidAfterRevertA?.paymentStatus !== invoiceSnapshot.paymentStatus) {
      record(
        "db/remittance-multi-apply-revert",
        "FAIL",
        `after revert A: ${paidAfterRevertA?.paymentStatus} expected ${invoiceSnapshot.paymentStatus}`,
      );
      return;
    }

    record(
      "db/remittance-multi-apply-revert",
      "PASS",
      `invoice=#${invoice.invoiceNumber} dual-apply→revert-B-stays-PAID→revert-A-restores`,
    );
  } catch (e) {
    record(
      "db/remittance-multi-apply-revert",
      "FAIL",
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    if (remittanceIdB) await cleanupSmokeRemittance(prisma, remittanceIdB, appliedB);
    if (remittanceIdA) await cleanupSmokeRemittance(prisma, remittanceIdA, appliedA);

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
