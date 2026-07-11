import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { calendarIsoFromDate } from "../src/lib/constants";
import { prisma } from "../src/lib/prisma";

async function main() {
  const inv = await prisma.invoice.findFirst({
    where: { invoiceNumber: 1023 },
    include: {
      client: { select: { firstName: true, lastName: true, lniClaimNumber: true } },
      therapist: { select: { firstName: true, lastName: true, email: true } },
      payPeriod: { select: { label: true, cutoffDate: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      attachments: { select: { filename: true, createdAt: true } },
    },
  });

  if (!inv) {
    console.log("Invoice #1023 not found");
    return;
  }

  console.log({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    totalAmount: Number(inv.totalAmount),
    therapist: `${inv.therapist.firstName} ${inv.therapist.lastName} (${inv.therapist.email})`,
    client: `${inv.client.lniClaimNumber} ${inv.client.firstName} ${inv.client.lastName}`,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    submittedAt: inv.submittedAt?.toISOString() ?? null,
    billedAt: inv.billedAt?.toISOString() ?? null,
    payPeriod: inv.payPeriod
      ? `${inv.payPeriod.label ?? ""} ${calendarIsoFromDate(inv.payPeriod.cutoffDate)}`
      : null,
    lineItems: inv.lineItems.map((li) => ({
      procedureCode: li.procedureCode,
      serviceDate: calendarIsoFromDate(li.serviceDate),
      amount: Number(li.amount),
      units: li.units,
    })),
    attachments: inv.attachments.map((a) => ({
      filename: a.filename,
      createdAt: a.createdAt.toISOString(),
    })),
  });

  const mariaMax = await prisma.invoice.findFirst({
    where: { therapist: { email: "maria@gvcounseling.com" } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  console.log("\nMaria max invoice #:", mariaMax?.invoiceNumber);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
