import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { formatDate } = await import("../src/lib/constants");
  const { startOfUtcDay } = await import("../src/lib/invoice-pay-period-grouping");

  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 1021 },
    include: {
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      therapist: { select: { firstName: true, lastName: true, email: true } },
      payPeriod: true,
      lineItems: { orderBy: { sortOrder: "asc" }, select: { serviceDate: true, procedureCode: true, amount: true } },
    },
  });

  if (!inv) {
    console.log("Invoice 1021 not found");
    await prisma.$disconnect();
    return;
  }

  const today = startOfUtcDay();
  const serviceDates = inv.lineItems.map((l) => l.serviceDate);
  const earliest = serviceDates.length
    ? new Date(Math.min(...serviceDates.map((d) => d.getTime())))
    : null;
  const latest = serviceDates.length
    ? new Date(Math.max(...serviceDates.map((d) => d.getTime())))
    : null;

  console.log(
    JSON.stringify(
      {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        paymentStatus: inv.paymentStatus,
        payPeriodId: inv.payPeriodId,
        payPeriod: inv.payPeriod
          ? {
              label: inv.payPeriod.label,
              cutoffDate: inv.payPeriod.cutoffDate,
              paymentDate: inv.payPeriod.paymentDate,
            }
          : null,
        therapist: `${inv.therapist.firstName} ${inv.therapist.lastName}`,
        client: `${inv.client.lastName}, ${inv.client.firstName} (${inv.client.lniClaimNumber})`,
        submittedAt: inv.submittedAt,
        billedAt: inv.billedAt,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        totalAmount: Number(inv.totalAmount),
        serviceDates: inv.lineItems.map((l) => ({
          date: l.serviceDate.toISOString().slice(0, 10),
          code: l.procedureCode,
          amount: Number(l.amount),
        })),
        earliestService: earliest?.toISOString().slice(0, 10) ?? null,
        latestService: latest?.toISOString().slice(0, 10) ?? null,
      },
      null,
      2,
    ),
  );

  // Candidate pay periods: upcoming/next by cutoff, and ones whose cutoff is after earliest service
  const periods = await prisma.payPeriod.findMany({
    orderBy: { cutoffDate: "asc" },
  });

  console.log("\nPay periods (nearest to service / today):");
  const relevant = periods.filter((p) => {
    if (!earliest) return true;
    // show periods with cutoff within ~60 days of earliest service or upcoming from today
    const cutoff = p.cutoffDate.getTime();
    const svc = earliest.getTime();
    return Math.abs(cutoff - svc) < 90 * 86400000 || cutoff >= today.getTime() - 30 * 86400000;
  });

  for (const p of relevant.slice(-15)) {
    const flags: string[] = [];
    if (p.cutoffDate >= today) flags.push("upcoming/current");
    if (earliest && p.cutoffDate >= earliest) flags.push("cutoff>=earliestDOS");
    if (latest && p.cutoffDate >= latest) flags.push("cutoff>=latestDOS");
    console.log(
      `- ${p.label ?? "(no label)"} | cutoff ${formatDate(p.cutoffDate)} | payment ${
        p.paymentDate ? formatDate(p.paymentDate) : "—"
      } ${flags.length ? `[${flags.join(", ")}]` : ""}`,
    );
  }

  const next = await prisma.payPeriod.findFirst({
    where: { cutoffDate: { gte: today } },
    orderBy: { cutoffDate: "asc" },
  });
  console.log(
    "\nNext pay period (admin default for unassigned tile):",
    next
      ? `${next.label ?? "(no label)"} cutoff ${formatDate(next.cutoffDate)} payment ${
          next.paymentDate ? formatDate(next.paymentDate) : "—"
        }`
      : "none",
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
