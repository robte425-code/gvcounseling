"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSession, requireTherapist, unstable_update } from "@/auth";
import { Gender, InvoiceStatus } from "@/generated/prisma/client";
import { buildEdi837, generateClmControlNumber, type Edi837Claim } from "@/lib/edi837";
import { client837Ready, parseClaimNumber } from "@/lib/constants";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

function parseDecimal(value: FormDataEntryValue | null): number {
  const n = parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ChangePasswordState = { error?: string };

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await requireSession();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 10) {
    return { error: "New password must be at least 10 characters." };
  }
  if (next !== confirm) {
    return { error: "Passwords do not match." };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const ok = await verifyPassword(current, user.passwordHash);
  if (!ok) {
    return { error: "Current password is incorrect." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });

  await unstable_update({ user: { mustChangePassword: false } });

  const dest =
    session.user.role === "ADMIN" ? "/portal/admin/dashboard" : "/portal/therapist/dashboard";
  redirect(dest);
}

export async function createPayPeriodAction(formData: FormData) {
  await requireAdmin();
  const cutoffDate = parseDate(formData.get("cutoffDate"));
  const paymentDate = parseDate(formData.get("paymentDate"));
  const label = String(formData.get("label") ?? "").trim() || null;

  if (!cutoffDate) throw new Error("Cutoff date is required.");

  await prisma.payPeriod.create({
    data: { cutoffDate, paymentDate, label },
  });
  revalidatePath("/portal/admin/pay-periods");
  revalidatePath("/portal/admin/generate-bill");
}

export async function deletePayPeriodAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const bills = await prisma.bill.count({ where: { payPeriodId: id } });
  if (bills > 0) {
    throw new Error("Cannot delete a pay period that already has generated bills.");
  }
  await prisma.payPeriod.delete({ where: { id } });
  revalidatePath("/portal/admin/pay-periods");
}

export async function saveClientAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const therapistId = String(formData.get("therapistId") ?? "");
  const claimNumber = parseClaimNumber(String(formData.get("lniClaimNumber") ?? ""));
  const diagnosesRaw = String(formData.get("diagnoses") ?? "");
  const diagnoses = diagnosesRaw
    .split(/[,;\n]+/)
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);

  const genderRaw = String(formData.get("gender") ?? "");
  const gender = genderRaw ? (genderRaw as Gender) : null;

  const data = {
    lniClaimNumber: claimNumber,
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    middleInitial: String(formData.get("middleInitial") ?? "").trim() || null,
    attendingNpi: String(formData.get("attendingNpi") ?? "").replace(/\D/g, "") || null,
    diagnoses,
    addressLine1: String(formData.get("addressLine1") ?? "").trim() || null,
    addressLine2: String(formData.get("addressLine2") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "WA").trim() || "WA",
    zip: String(formData.get("zip") ?? "").trim() || null,
    dateOfBirth: parseDate(formData.get("dateOfBirth")),
    gender,
    dateOfInjury: parseDate(formData.get("dateOfInjury")),
    vrcName: String(formData.get("vrcName") ?? "").trim() || null,
    vrcEmail: String(formData.get("vrcEmail") ?? "").trim() || null,
    vrcPhone: String(formData.get("vrcPhone") ?? "").trim() || null,
    therapistId,
  };

  if (!data.firstName || !data.lastName || !claimNumber || !therapistId) {
    throw new Error("Claim number, name, and therapist are required.");
  }

  if (id) {
    await prisma.client.update({ where: { id }, data });
    revalidatePath(`/portal/admin/clients/${id}`);
  } else {
    await prisma.client.create({ data });
  }
  revalidatePath("/portal/admin/clients");
  redirect("/portal/admin/clients");
}

export async function deleteClientAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const invoiceCount = await prisma.invoice.count({ where: { clientId: id } });
  if (invoiceCount > 0) {
    throw new Error("Cannot delete a client with invoices.");
  }
  await prisma.client.delete({ where: { id } });
  revalidatePath("/portal/admin/clients");
  redirect("/portal/admin/clients");
}

async function nextInvoiceNumber(therapistId: string): Promise<number> {
  const last = await prisma.invoice.findFirst({
    where: { therapistId },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  return (last?.invoiceNumber ?? 0) + 1;
}

export async function createInvoiceAction(formData: FormData) {
  const session = await requireTherapist();
  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.client.findFirst({
    where: { id: clientId, therapistId: session.user.id },
  });
  if (!client) throw new Error("Client not found.");

  const invoice = await prisma.invoice.create({
    data: {
      therapistId: session.user.id,
      clientId,
      invoiceNumber: await nextInvoiceNumber(session.user.id),
      totalAmount: 0,
      status: "DRAFT",
    },
  });
  redirect(`/portal/therapist/invoices/${invoice.id}`);
}

export async function saveInvoiceAction(formData: FormData) {
  const session = await requireSession();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (session.user.role === "THERAPIST" && invoice.therapistId !== session.user.id) {
    throw new Error("Forbidden.");
  }
  if (invoice.status !== "DRAFT" && session.user.role === "THERAPIST") {
    throw new Error("Only draft invoices can be edited.");
  }

  const lineCount = parseInt(String(formData.get("lineCount") ?? "0"), 10);
  const lineItems: { serviceDate: Date; procedureCode: string; amount: number; sortOrder: number }[] =
    [];

  for (let i = 0; i < lineCount; i++) {
    const serviceDate = parseDate(formData.get(`line_${i}_serviceDate`));
    const procedureCode = String(formData.get(`line_${i}_procedureCode`) ?? "").trim();
    const amount = parseDecimal(formData.get(`line_${i}_amount`));
    if (!serviceDate || !procedureCode || amount <= 0) continue;
    lineItems.push({ serviceDate, procedureCode, amount, sortOrder: i });
  }

  if (!lineItems.length) {
    throw new Error("Add at least one service line with date, code, and amount.");
  }

  const totalAmount = lineItems.reduce((s, l) => s + l.amount, 0);

  await prisma.$transaction([
    prisma.invoiceLineItem.deleteMany({ where: { invoiceId } }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { totalAmount },
    }),
    ...lineItems.map((line) =>
      prisma.invoiceLineItem.create({
        data: { invoiceId, ...line, units: 1 },
      }),
    ),
  ]);

  revalidatePath(`/portal/therapist/invoices/${invoiceId}`);
  revalidatePath("/portal/admin/invoices");
}

export async function submitInvoiceAction(formData: FormData) {
  const session = await requireTherapist();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, therapistId: session.user.id },
    include: { lineItems: true, client: true },
  });
  if (!invoice || invoice.status !== "DRAFT") throw new Error("Invoice cannot be submitted.");
  if (!invoice.lineItems.length) throw new Error("Add line items before submitting.");

  const readiness = client837Ready(invoice.client);
  if (!readiness.ready) {
    throw new Error(
      `Client is missing required billing fields: ${readiness.missing.join(", ")}. Ask admin to update the client record.`,
    );
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  revalidatePath(`/portal/therapist/invoices/${invoiceId}`);
  revalidatePath("/portal/admin/invoices");
}

export async function unsubmitInvoiceAction(formData: FormData) {
  const session = await requireTherapist();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, therapistId: session.user.id },
  });
  if (!invoice || invoice.status !== "SUBMITTED") throw new Error("Invoice cannot be un-submitted.");

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "DRAFT", submittedAt: null },
  });
  revalidatePath(`/portal/therapist/invoices/${invoiceId}`);
}

export async function deleteInvoiceAction(formData: FormData) {
  const session = await requireTherapist();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, therapistId: session.user.id },
  });
  if (!invoice || invoice.status !== "DRAFT") throw new Error("Only draft invoices can be deleted.");
  await prisma.invoice.delete({ where: { id: invoiceId } });
  revalidatePath("/portal/therapist/invoices");
  redirect("/portal/therapist/invoices");
}

export async function generateBillAction(formData: FormData) {
  const session = await requireAdmin();
  const payPeriodId = String(formData.get("payPeriodId") ?? "");
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found.");

  const invoices = await prisma.invoice.findMany({
    where: {
      status: "SUBMITTED",
      submittedAt: { lte: payPeriod.cutoffDate },
    },
    include: {
      client: true,
      therapist: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ therapist: { lastName: "asc" } }, { invoiceNumber: "asc" }],
  });

  if (!invoices.length) {
    throw new Error("No submitted invoices are queued for this pay period cutoff.");
  }

  const blocked: string[] = [];
  for (const inv of invoices) {
    const readiness = client837Ready(inv.client);
    if (!readiness.ready) {
      blocked.push(`${inv.client.lniClaimNumber} (${readiness.missing.join(", ")})`);
    }
    if (!inv.therapist.lniProviderId) {
      blocked.push(`${inv.client.lniClaimNumber} (therapist L&I ID missing)`);
    }
  }
  if (blocked.length) {
    throw new Error(`Cannot generate bill. Missing data: ${blocked.slice(0, 5).join("; ")}`);
  }

  const claims: Edi837Claim[] = invoices.map((inv) => {
    const dx = inv.client.diagnoses;
    return {
      clmControlNumber: inv.clmControlNumber ?? generateClmControlNumber(),
      client: {
        claimNumber: inv.client.lniClaimNumber,
        lastName: inv.client.lastName,
        firstName: inv.client.firstName,
        addressLine1: inv.client.addressLine1!,
        city: inv.client.city!,
        state: inv.client.state,
        zip: inv.client.zip!,
        dateOfBirth: inv.client.dateOfBirth!,
        gender: inv.client.gender ?? "U",
        dateOfInjury: inv.client.dateOfInjury,
        primaryDiagnosis: dx[0]!,
        additionalDiagnoses: dx.slice(1),
      },
      therapist: {
        lastName: inv.therapist.lastName,
        firstName: inv.therapist.firstName,
        lniProviderId: inv.therapist.lniProviderId!,
      },
      lines: inv.lineItems.map((line) => ({
        procedureCode: line.procedureCode,
        amount: Number(line.amount),
        serviceDate: line.serviceDate,
        units: line.units,
      })),
    };
  });

  const edi = buildEdi837(claims);
  const now = new Date();

  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        payPeriodId,
        filename: edi.filename,
        isaControl: edi.isaControl,
        gsControl: edi.gsControl,
        invoiceCount: edi.claimCount,
        totalAmount: edi.totalAmount,
        ediContent: edi.content,
        generatedById: session.user.id,
      },
    });

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i]!;
      const claim = claims[i]!;
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          status: "BILLED" satisfies InvoiceStatus,
          billId: created.id,
          billedAt: now,
          clmControlNumber: claim.clmControlNumber,
        },
      });
    }

    return created;
  });

  revalidatePath("/portal/admin/bills");
  revalidatePath("/portal/admin/invoices");
  revalidatePath("/portal/admin/generate-bill");
  redirect(`/portal/admin/bills/${bill.id}?generated=1`);
}
