"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getRealRole,
  getRealUserId,
  isImpersonating,
  requireAdmin,
  requireSession,
  requireTherapist,
  unstable_update,
} from "@/auth";
import type { ImpersonationUpdate } from "@/types/next-auth";
import { Gender } from "@/generated/prisma/client";
import { parseClaimNumber } from "@/lib/constants";
import { moveClientDriveFolderToTherapist } from "@/lib/client-drive-move";
import { ensureTherapistDriveFolder, removeTherapistDriveFolder, deleteInvoiceDriveAttachments } from "@/lib/google-drive";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { getSystemDriveAccessToken } from "@/lib/google-drive-system";
import { sendAdminWelcomeEmail, sendTherapistAssignmentEmail, sendTherapistWelcomeEmail } from "@/lib/referral-emails";
import { generateOneTimePassword, hashPassword, verifyPassword } from "@/lib/password";
import { fetchLniPayPeriods } from "@/lib/lni-pay-periods";
import { createProcedureCodeFee, createTherapistProcedureCodeFee, updateTherapistProcedureCodeFee, applyTherapistFeeSchedule } from "@/lib/procedure-fees";
import { prisma } from "@/lib/prisma";
import { getNextInvoiceNumber } from "@/lib/invoice-numbers";
import { emailVrcsForPayPeriod, parseVrcEmailDestinationParam } from "@/lib/vrc-billing-emails";

function parseDecimal(value: FormDataEntryValue | null): number {
  const n = parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEmail(raw: string): string {
  const email = raw.toLowerCase().trim();
  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required.");
  }
  return email;
}

async function notifyAssignedTherapist(
  client: { id: string; firstName: string; lastName: string; lniClaimNumber: string },
  therapistId: string,
) {
  const therapist = await prisma.user.findUnique({
    where: { id: therapistId, role: "THERAPIST", active: true },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!therapist) return;

  await sendTherapistAssignmentEmail({
    therapistEmail: therapist.email,
    therapistName: `${therapist.firstName} ${therapist.lastName}`,
    clientName: `${client.firstName} ${client.lastName}`,
    claimNumber: client.lniClaimNumber,
    clientId: client.id,
  });
}

async function findPayPeriodByCutoff(cutoffDate: Date) {
  const dayStart = Date.UTC(
    cutoffDate.getUTCFullYear(),
    cutoffDate.getUTCMonth(),
    cutoffDate.getUTCDate(),
  );
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return prisma.payPeriod.findFirst({
    where: {
      cutoffDate: { gte: new Date(dayStart), lt: new Date(dayEnd) },
    },
  });
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

  const user = await prisma.user.findUniqueOrThrow({ where: { id: getRealUserId(session) } });
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
    getRealRole(session) === "ADMIN" ? "/portal/admin/dashboard" : "/portal/therapist/dashboard";
  redirect(dest);
}

export async function startImpersonationAction(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!email) throw new Error("Therapist email is required.");

  const therapist = await prisma.user.findFirst({
    where: { email, role: "THERAPIST", active: true },
    select: { id: true, role: true, firstName: true, lastName: true },
  });
  if (!therapist) throw new Error("Therapist not found.");

  const impersonation: ImpersonationUpdate = { action: "start", user: therapist };
  await unstable_update({ impersonation } as Record<string, unknown>);

  redirect("/portal/therapist/dashboard");
}

export async function stopImpersonationAction() {
  const session = await requireSession();
  if (!isImpersonating(session)) {
    redirect("/portal/admin/dashboard");
  }

  const impersonation: ImpersonationUpdate = { action: "stop" };
  await unstable_update({ impersonation } as Record<string, unknown>);

  redirect("/portal/admin/dashboard");
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
  revalidatePath("/portal/admin/billing");
}

export async function deletePayPeriodAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const invoices = await prisma.invoice.count({ where: { payPeriodId: id } });
  if (invoices > 0) {
    throw new Error("Cannot delete a pay period that has assigned invoices.");
  }
  await prisma.payPeriod.delete({ where: { id } });
  revalidatePath("/portal/admin/billing");
}

export async function createProcedureCodeFeeAction(formData: FormData) {
  const session = await requireAdmin();
  const procedureCode = String(formData.get("procedureCode") ?? "").trim();
  const amount = parseDecimal(formData.get("amount"));
  const effectiveFrom = parseDate(formData.get("effectiveFrom"));

  if (!effectiveFrom) throw new Error("Effective from date is required.");

  await createProcedureCodeFee({
    procedureCode,
    amount,
    effectiveFrom,
    createdById: session.user.id,
  });

  revalidatePath("/portal/admin/billing");
  revalidatePath("/portal/admin/billing/fees/history");
}

export async function createTherapistProcedureCodeFeeAction(formData: FormData) {
  const session = await requireAdmin();
  const therapistId = String(formData.get("therapistId") ?? "").trim();
  const procedureCode = String(formData.get("procedureCode") ?? "").trim();
  const amount = parseDecimal(formData.get("amount"));
  const effectiveFrom = parseDate(formData.get("effectiveFrom"));

  if (!therapistId) throw new Error("Therapist is required.");
  if (!effectiveFrom) throw new Error("Effective from date is required.");

  await createTherapistProcedureCodeFee({
    therapistId,
    procedureCode,
    amount,
    effectiveFrom,
    createdById: session.user.id,
  });

  revalidatePath(`/portal/admin/therapists/${therapistId}/edit`);
  revalidatePath(`/portal/admin/therapists/${therapistId}/fees/history`);
  revalidatePath("/portal/therapist/fees");
}

export async function updateTherapistProcedureCodeFeeAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const therapistId = String(formData.get("therapistId") ?? "").trim();
  const procedureCode = String(formData.get("procedureCode") ?? "").trim();
  const amount = parseDecimal(formData.get("amount"));
  const effectiveFrom = parseDate(formData.get("effectiveFrom"));

  if (!id) throw new Error("Fee is required.");
  if (!therapistId) throw new Error("Therapist is required.");
  if (!effectiveFrom) throw new Error("Effective from date is required.");

  await updateTherapistProcedureCodeFee({
    id,
    therapistId,
    procedureCode,
    amount,
    effectiveFrom,
    createdById: session.user.id,
  });

  revalidatePath(`/portal/admin/therapists/${therapistId}/edit`);
  revalidatePath(`/portal/admin/therapists/${therapistId}/fees/history`);
  revalidatePath("/portal/therapist/fees");
}

export async function syncPayPeriodsFromLniAction() {
  await requireAdmin();

  const rows = await fetchLniPayPeriods();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await findPayPeriodByCutoff(row.cutoffDate);
    if (existing) {
      await prisma.payPeriod.update({
        where: { id: existing.id },
        data: {
          paymentDate: row.paymentDate,
          label: existing.label ?? row.label,
        },
      });
      updated++;
    } else {
      await prisma.payPeriod.create({
        data: {
          cutoffDate: row.cutoffDate,
          paymentDate: row.paymentDate,
          label: row.label,
        },
      });
      created++;
    }
  }

  revalidatePath("/portal/admin/billing");
  redirect(
    `/portal/admin/billing?synced=1&created=${created}&updated=${updated}&total=${rows.length}`,
  );
}

export async function saveClientAction(formData: FormData) {
  const session = await requireSession();
  const isAdmin = getRealRole(session) === "ADMIN" && !isImpersonating(session);
  const id = String(formData.get("id") ?? "").trim();
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();

  if (!id && !isAdmin) {
    throw new Error("Only admins can create clients.");
  }

  const existing = id ? await prisma.client.findUnique({ where: { id } }) : null;
  if (id && !existing) {
    throw new Error("Client not found.");
  }

  if (id && !isAdmin) {
    if (session.user.role !== "THERAPIST" || existing!.therapistId !== session.user.id) {
      throw new Error("You cannot edit this client.");
    }
  }

  let therapistId = existing?.therapistId ?? null;
  if (isAdmin) {
    const therapistIdRaw = String(formData.get("therapistId") ?? "").trim();
    therapistId = therapistIdRaw || therapistId;
  }
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
    residenceAddressLine1: String(formData.get("residenceAddressLine1") ?? "").trim() || null,
    residenceCity: String(formData.get("residenceCity") ?? "").trim() || null,
    residenceState: String(formData.get("residenceState") ?? "WA").trim() || null,
    residenceZip: String(formData.get("residenceZip") ?? "").trim() || null,
    workerPhone: String(formData.get("workerPhone") ?? "").trim() || null,
    employerName: String(formData.get("employerName") ?? "").trim() || null,
    attendingDoctorName: String(formData.get("attendingDoctorName") ?? "").trim() || null,
    attendingDoctorAddress: String(formData.get("attendingDoctorAddress") ?? "").trim() || null,
    attendingDoctorPhone: String(formData.get("attendingDoctorPhone") ?? "").trim() || null,
    claimManagerName: String(formData.get("claimManagerName") ?? "").trim() || null,
    claimManagerPhone: String(formData.get("claimManagerPhone") ?? "").trim() || null,
    claimManagerFax: String(formData.get("claimManagerFax") ?? "").trim() || null,
    legalRepresentativeName: String(formData.get("legalRepresentativeName") ?? "").trim() || null,
    legalRepresentativeAddress:
      String(formData.get("legalRepresentativeAddress") ?? "").trim() || null,
    legalRepresentativePhone:
      String(formData.get("legalRepresentativePhone") ?? "").trim() || null,
    dateOfBirth: parseDate(formData.get("dateOfBirth")),
    gender,
    dateOfInjury: parseDate(formData.get("dateOfInjury")),
    vrcName: String(formData.get("vrcName") ?? "").trim() || null,
    vrcEmail: String(formData.get("vrcEmail") ?? "").trim() || null,
    vrcPhone: String(formData.get("vrcPhone") ?? "").trim() || null,
    therapistId,
  };

  if (!data.firstName || !data.lastName || !claimNumber) {
    throw new Error("Claim number and name are required.");
  }
  if (!id && !therapistId) {
    throw new Error("Therapist is required for new clients.");
  }

  const therapistChanged = isAdmin && !!therapistId && therapistId !== existing?.therapistId;

  if (isAdmin && therapistId && (therapistChanged || !id)) {
    const assignable = await prisma.user.findFirst({
      where: { id: therapistId, role: "THERAPIST", active: true },
      select: { id: true },
    });
    if (!assignable) {
      throw new Error("Selected therapist not found or is inactive.");
    }
  }

  if (isAdmin && therapistChanged && existing?.driveFolderId && therapistId) {
    const therapist = await prisma.user.findUnique({
      where: { id: therapistId, role: "THERAPIST", active: true },
      select: { email: true, firstName: true, lastName: true },
    });
    if (therapist) {
      await moveClientDriveFolderToTherapist(existing.driveFolderId, therapist);
    }
  }

  if (id) {
    await prisma.client.update({
      where: { id },
      data: {
        ...data,
        therapistId,
        ...(therapistChanged
          ? {
              assignmentStatus: "PENDING_THERAPIST",
              rejectionReason: null,
              rejectedAt: null,
            }
          : {}),
      },
    });
    if (therapistChanged && therapistId) {
      await notifyAssignedTherapist(
        { id, firstName: data.firstName, lastName: data.lastName, lniClaimNumber: claimNumber },
        therapistId,
      );
    }
    revalidatePath("/portal/admin/clients");
    revalidatePath(`/portal/admin/clients/${id}`);
    revalidatePath(`/portal/admin/clients/${id}/edit`);
    revalidatePath("/portal/therapist/clients");
    revalidatePath(`/portal/therapist/clients/${id}`);
    revalidatePath(`/portal/therapist/clients/${id}/edit`);
    revalidatePath("/portal/therapist/dashboard");
    const returnTo = returnToRaw || `/portal/admin/clients/${id}`;
    redirect(returnTo.includes("?") ? `${returnTo}&saved=1` : `${returnTo}?saved=1`);
  } else {
    const client = await prisma.client.create({
      data: { ...data, therapistId: therapistId!, assignmentStatus: "PENDING_THERAPIST" },
    });
    await notifyAssignedTherapist(client, therapistId!);
  }
  revalidatePath("/portal/admin/clients");
  revalidatePath("/portal/therapist/dashboard");
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

function parseInvoiceLineItems(formData: FormData) {
  const lineCount = parseInt(String(formData.get("lineCount") ?? "0"), 10);
  const lineItems: { serviceDate: Date; procedureCode: string; sortOrder: number }[] = [];

  for (let i = 0; i < lineCount; i++) {
    const serviceDate = parseDate(formData.get(`line_${i}_serviceDate`));
    const procedureCode = String(formData.get(`line_${i}_procedureCode`) ?? "").trim();
    if (!serviceDate || !procedureCode) continue;
    lineItems.push({ serviceDate, procedureCode, sortOrder: i });
  }

  if (!lineItems.length) {
    throw new Error("Add at least one service line with date and procedure code.");
  }

  return lineItems;
}

async function resolveInvoiceClientUpdate(
  session: Awaited<ReturnType<typeof requireSession>>,
  formData: FormData,
) {
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId || session.user.role !== "THERAPIST") return {};

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      therapistId: session.user.id,
      assignmentStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found.");

  return { clientId };
}

async function persistInvoiceFromFormData(
  session: Awaited<ReturnType<typeof requireSession>>,
  formData: FormData,
  options: { allowCreate: boolean },
) {
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const lineItems = parseInvoiceLineItems(formData);

  const therapistIdForFees = invoiceId
    ? (
        await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { therapistId: true },
        })
      )?.therapistId
    : session.user.id;

  if (!therapistIdForFees) throw new Error("Invoice not found.");

  const pricedLineItems = await applyTherapistFeeSchedule(therapistIdForFees, lineItems);
  const totalAmount = pricedLineItems.reduce((s, l) => s + l.amount, 0);

  if (!invoiceId) {
    if (!options.allowCreate) {
      throw new Error("Invoice not found.");
    }
    if (session.user.role !== "THERAPIST") {
      throw new Error("Only therapists can create invoices.");
    }

    const clientId = String(formData.get("clientId") ?? "").trim();
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
        assignmentStatus: "ACTIVE",
      },
    });
    if (!client) throw new Error("Client not found.");

    const invoice = await prisma.invoice.create({
      data: {
        therapistId: session.user.id,
        clientId,
        invoiceNumber: await getNextInvoiceNumber(prisma, session.user.id),
        totalAmount,
        status: "DRAFT",
        lineItems: {
          create: pricedLineItems.map((line) => ({ ...line, units: 1 })),
        },
      },
      include: { client: true },
    });

    return { invoice, created: true as const };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (session.user.role === "THERAPIST" && invoice.therapistId !== session.user.id) {
    throw new Error("Forbidden.");
  }
  if (invoice.status !== "DRAFT" && session.user.role === "THERAPIST") {
    throw new Error("Only draft invoices can be edited.");
  }

  await prisma.$transaction([
    prisma.invoiceLineItem.deleteMany({ where: { invoiceId } }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount,
        ...(await resolveInvoiceClientUpdate(session, formData)),
      },
    }),
    ...pricedLineItems.map((line) =>
      prisma.invoiceLineItem.create({
        data: { invoiceId, ...line, units: 1 },
      }),
    ),
  ]);

  const updated = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { client: true },
  });

  return { invoice: updated, created: false as const };
}

/** Auto-save draft line items (existing draft invoices only). */
export async function saveInvoiceDraftAction(formData: FormData) {
  const session = await requireSession();
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) return;

  await persistInvoiceFromFormData(session, formData, { allowCreate: false });

  revalidatePath(`/portal/therapist/invoices/${invoiceId}`);
  revalidatePath("/portal/therapist/invoices/new");
  revalidatePath("/portal/admin/invoices");
}

export async function createInvoiceDraftAction(clientId: string) {
  const session = await requireTherapist();
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      therapistId: session.user.id,
      assignmentStatus: "ACTIVE",
    },
  });
  if (!client) throw new Error("Client not found.");

  const invoice = await prisma.invoice.create({
    data: {
      therapistId: session.user.id,
      clientId,
      invoiceNumber: await getNextInvoiceNumber(prisma, session.user.id),
      totalAmount: 0,
      status: "DRAFT",
    },
  });

  revalidatePath("/portal/therapist/invoices");
  revalidatePath("/portal/therapist/invoices/new");

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
}

export type SubmitInvoiceState = { error?: string };

export async function submitInvoiceAction(
  _prevState: SubmitInvoiceState,
  formData: FormData,
): Promise<SubmitInvoiceState> {
  const session = await requireTherapist();

  let invoice;
  try {
    ({ invoice } = await persistInvoiceFromFormData(session, formData, {
      allowCreate: true,
    }));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save invoice before submitting.",
    };
  }

  if (invoice.status !== "DRAFT") {
    return { error: "Invoice cannot be submitted." };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });

  revalidatePath(`/portal/therapist/invoices/${invoice.id}`);
  revalidatePath("/portal/therapist/invoices");
  revalidatePath("/portal/therapist/invoices/new");
  revalidatePath("/portal/admin/invoices");

  redirect(`/portal/therapist/invoices/${invoice.id}`);
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
    data: { status: "DRAFT", submittedAt: null, payPeriodId: null },
  });
  revalidatePath(`/portal/therapist/invoices/${invoiceId}`);
}

async function removeInvoiceDriveAttachments(
  invoice: {
    therapistId: string;
    client: { driveFolderId: string | null };
    attachments: { blobUrl: string }[];
  },
  initiatorUserId: string,
) {
  if (!invoice.client.driveFolderId || invoice.attachments.length === 0) return;

  try {
    const accessToken = await getDriveAccessTokenForClient({
      therapistId: invoice.therapistId,
      initiatorUserId,
    });
    await deleteInvoiceDriveAttachments(
      accessToken,
      invoice.client.driveFolderId,
      invoice.attachments,
    );
  } catch (error) {
    console.error("Invoice Drive cleanup failed:", error);
  }
}

export async function deleteInvoiceAction(formData: FormData) {
  const session = await requireTherapist();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, therapistId: session.user.id },
    include: {
      client: { select: { driveFolderId: true } },
      attachments: { select: { blobUrl: true } },
    },
  });
  if (!invoice || invoice.status !== "DRAFT") throw new Error("Only draft invoices can be deleted.");

  await removeInvoiceDriveAttachments(invoice, session.user.id);
  await prisma.invoice.delete({ where: { id: invoiceId } });
  revalidatePath("/portal/therapist/invoices");
  redirect("/portal/therapist/invoices");
}

export async function deleteAdminInvoiceAction(formData: FormData) {
  const session = await requireAdmin();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: { select: { driveFolderId: true } },
      attachments: { select: { blobUrl: true } },
    },
  });
  if (!invoice) throw new Error("Invoice not found.");

  await removeInvoiceDriveAttachments(invoice, session.user.id);
  await prisma.invoice.delete({ where: { id: invoiceId } });
  revalidatePath("/portal/admin/invoices");
  revalidatePath(`/portal/admin/invoices/${invoiceId}`);
  revalidatePath("/portal/therapist/invoices");
  revalidatePath(`/portal/therapist/invoices/${invoiceId}`);
  redirect("/portal/admin/invoices");
}

export async function assignInvoicesToPayPeriodAction(formData: FormData) {
  await requireAdmin();
  const payPeriodIdRaw = String(formData.get("payPeriodId") ?? "").trim();
  const payPeriodId = payPeriodIdRaw || null;
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/portal/admin/invoices";
  const invoiceIds = formData
    .getAll("invoiceIds")
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (!invoiceIds.length) {
    throw new Error("Select at least one invoice.");
  }

  if (payPeriodId) {
    const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
    if (!payPeriod) throw new Error("Pay period not found.");
  }

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: { id: true, status: true, invoiceNumber: true },
  });

  if (invoices.length !== invoiceIds.length) {
    throw new Error("One or more invoices were not found.");
  }

  const invalid = invoices.filter((inv) => inv.status !== "SUBMITTED");
  if (invalid.length) {
    const numbers = invalid.map((inv) => `#${inv.invoiceNumber}`).join(", ");
    throw new Error(`Only submitted invoices can be assigned. Invalid: ${numbers}`);
  }

  await prisma.invoice.updateMany({
    where: { id: { in: invoiceIds } },
    data: { payPeriodId },
  });

  revalidatePath("/portal/admin/invoices");
  revalidatePath("/portal/admin/billing");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assigned=${invoiceIds.length}`);
}

export async function emailVrcsForPayPeriodAction(formData: FormData) {
  const session = await requireAdmin();
  const payPeriodId = String(formData.get("payPeriodId") ?? "").trim();
  if (!payPeriodId) throw new Error("Pay period is required.");

  const vrcEmailDestination =
    parseVrcEmailDestinationParam(String(formData.get("vrcEmailDestination") ?? "")) ?? "vrc";

  const result = await emailVrcsForPayPeriod({
    payPeriodId,
    initiatorUserId: session.user.id,
    vrcEmailDestination,
  });

  revalidatePath("/portal/admin/billing");

  const params = new URLSearchParams();
  params.set("vrcEmailed", "1");
  params.set("sent", String(result.sent));
  if (result.skipped.length) {
    params.set("vrcSkipped", result.skipped.slice(0, 5).join(";;"));
  }
  if (result.errors.length) {
    params.set("vrcErrors", result.errors.slice(0, 5).join(";;"));
  }

  redirect(`/portal/admin/billing?${params.toString()}`);
}

export async function assignClientTherapistAction(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const therapistId = String(formData.get("therapistId") ?? "").trim();
  if (!clientId || !therapistId) throw new Error("Client and therapist are required.");

  const [client, therapist] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.user.findUnique({ where: { id: therapistId, role: "THERAPIST", active: true } }),
  ]);
  if (!client) throw new Error("Client not found.");
  if (!therapist) throw new Error("Therapist not found.");
  if (
    client.assignmentStatus !== "UNASSIGNED" &&
    client.assignmentStatus !== "REJECTED_BY_ADMIN"
  ) {
    throw new Error("This client is not awaiting therapist assignment.");
  }

  await moveClientDriveFolderToTherapist(client.driveFolderId, {
    email: therapist.email,
    firstName: therapist.firstName,
    lastName: therapist.lastName,
  });

  await prisma.client.update({
    where: { id: clientId },
    data: {
      therapistId,
      assignmentStatus: "PENDING_THERAPIST",
      rejectionReason: null,
      rejectedAt: null,
    },
  });

  await notifyAssignedTherapist(client, therapistId);

  revalidatePath("/portal/admin/clients");
  revalidatePath(`/portal/admin/clients/${clientId}`);
  revalidatePath("/portal/therapist/dashboard");
  redirect(`/portal/admin/clients/${clientId}?assigned=1`);
}

export async function adminRejectReferralAction(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found.");
  if (client.assignmentStatus !== "UNASSIGNED") {
    throw new Error("Only unassigned referrals can be rejected this way.");
  }

  const invoiceCount = await prisma.invoice.count({ where: { clientId } });
  if (invoiceCount > 0) {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        assignmentStatus: "REJECTED_BY_ADMIN",
        rejectionReason: reason || "Rejected by admin",
        rejectedAt: new Date(),
        therapistId: null,
      },
    });
  } else {
    await prisma.client.delete({ where: { id: clientId } });
  }

  revalidatePath("/portal/admin/clients");
  redirect("/portal/admin/clients?rejected=1");
}

export async function reopenClientAction(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found.");
  if (client.assignmentStatus !== "CLOSED") {
    throw new Error("Only closed clients can be reopened.");
  }

  await prisma.client.update({
    where: { id: clientId },
    data: {
      assignmentStatus: client.therapistId ? "ACTIVE" : "UNASSIGNED",
      closedAt: null,
    },
  });

  revalidatePath("/portal/admin/clients");
  revalidatePath(`/portal/admin/clients/${clientId}`);
  redirect(`/portal/admin/clients/${clientId}?reopened=1`);
}

export async function therapistAcceptReferralAction(formData: FormData) {
  const session = await requireTherapist();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      therapistId: session.user.id,
      assignmentStatus: "PENDING_THERAPIST",
    },
  });
  if (!client) throw new Error("Referral not found or not pending your acceptance.");

  const therapist = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { email: true, firstName: true, lastName: true },
  });
  await moveClientDriveFolderToTherapist(client.driveFolderId, therapist);

  await prisma.client.update({
    where: { id: clientId },
    data: { assignmentStatus: "ACTIVE" },
  });

  revalidatePath("/portal/therapist/dashboard");
  redirect("/portal/therapist/dashboard?referralAccepted=1");
}

export async function therapistRejectReferralAction(formData: FormData) {
  const session = await requireTherapist();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Please provide a reason for declining this referral.");

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      therapistId: session.user.id,
      assignmentStatus: "PENDING_THERAPIST",
    },
    include: { therapist: { select: { firstName: true, lastName: true } } },
  });
  if (!client) throw new Error("Referral not found or not pending your acceptance.");

  if (client.driveFolderId) {
    try {
      const { accessToken } = await import("@/lib/google-drive-system").then((m) =>
        m.getSystemDriveAccessToken(),
      );
      const { moveDriveFolder, resolveNewReferralsFolderId } = await import("@/lib/google-drive");
      const newReferralsId = await resolveNewReferralsFolderId(accessToken);
      await moveDriveFolder(accessToken, client.driveFolderId, newReferralsId);
    } catch (e) {
      console.error("Drive folder move on reject failed:", e);
    }
  }

  await prisma.client.update({
    where: { id: clientId },
    data: {
      therapistId: null,
      assignmentStatus: "UNASSIGNED",
      rejectionReason: reason,
      rejectedAt: new Date(),
    },
  });

  const adminEmail = process.env.CONTACT_EMAIL?.trim() || "ghim@gvcounseling.com";
  const { sendAdminTherapistRejectionEmail } = await import("@/lib/referral-emails");
  await sendAdminTherapistRejectionEmail({
    adminEmail,
    therapistName: `${client.therapist!.firstName} ${client.therapist!.lastName}`,
    clientName: `${client.firstName} ${client.lastName}`,
    claimNumber: client.lniClaimNumber,
    reason,
    clientId: client.id,
  });

  revalidatePath("/portal/admin/clients");
  revalidatePath(`/portal/admin/clients/${clientId}`);
  redirect("/portal/therapist/dashboard?referralDeclined=1");
}

function parseTherapistFields(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const lniProviderId = String(formData.get("lniProviderId") ?? "").trim() || null;
  const npi = String(formData.get("npi") ?? "").trim() || null;

  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }

  return { firstName, lastName, email, lniProviderId, npi };
}

async function setupTherapistWelcomeAndDrive(
  fields: { firstName: string; lastName: string; email: string },
  password: string,
  mustChangePassword: boolean,
): Promise<{ emailWarning?: string; driveWarning?: string }> {
  let emailWarning: string | undefined;
  let driveWarning: string | undefined;

  try {
    await sendTherapistWelcomeEmail({
      therapistEmail: fields.email,
      therapistName: `${fields.firstName} ${fields.lastName}`,
      password,
      mustChangePassword,
    });
  } catch (e) {
    emailWarning = e instanceof Error ? e.message : "Welcome email could not be sent.";
  }

  try {
    const { accessToken } = await getSystemDriveAccessToken();
    await ensureTherapistDriveFolder(accessToken, {
      firstName: fields.firstName,
      lastName: fields.lastName,
    });
  } catch (e) {
    driveWarning =
      e instanceof Error ? e.message : "Google Drive folder could not be created.";
  }

  return { emailWarning, driveWarning };
}

export type TherapistFormState = { error?: string };

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

export async function createTherapistAction(
  _prevState: TherapistFormState,
  formData: FormData,
): Promise<TherapistFormState> {
  try {
    const session = await requireAdmin();
    const fields = parseTherapistFields(formData);

    const existing = await prisma.user.findUnique({ where: { email: fields.email } });

    let password = String(formData.get("password") ?? "").trim();
    const adminSetPassword = password.length > 0;
    if (!password) {
      password = generateOneTimePassword();
    } else if (password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }

    const mustChangePassword = !adminSetPassword;
    let restored = false;

    if (existing) {
      if (existing.role === "ADMIN") {
        const isOwnAdminEmail = existing.id === getRealUserId(session);
        return {
          error: isOwnAdminEmail
            ? "This is your admin login email. Use a different email for the therapist account."
            : `This email belongs to an admin account (${existing.email}). Remove it from Admins, or use a different email.`,
        };
      }
      if (existing.active) {
        return {
          error:
            "A therapist with this email already exists. Open them from the therapists list to edit or deactivate.",
        };
      }
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...fields,
          active: true,
          passwordHash: await hashPassword(password),
          mustChangePassword,
        },
      });
      restored = true;
    } else {
      await prisma.user.create({
        data: {
          ...fields,
          role: "THERAPIST",
          passwordHash: await hashPassword(password),
          mustChangePassword,
        },
      });
    }

    const { emailWarning, driveWarning } = await setupTherapistWelcomeAndDrive(
      fields,
      password,
      mustChangePassword,
    );

    revalidatePath("/portal/admin/therapists");
    const params = new URLSearchParams(restored ? { reactivated: "1" } : { created: "1" });
    if (driveWarning) params.set("driveWarning", driveWarning);
    if (emailWarning) params.set("emailWarning", emailWarning);
    redirect(`/portal/admin/therapists?${params.toString()}`);
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return {
      error: e instanceof Error ? e.message : "Could not create therapist.",
    };
  }
}

export async function updateTherapistAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Therapist id is required.");

  const therapist = await prisma.user.findFirst({
    where: { id, role: "THERAPIST" },
    select: { id: true, email: true },
  });
  if (!therapist) throw new Error("Therapist not found.");

  const fields = parseTherapistFields(formData);
  if (fields.email !== therapist.email) {
    const existing = await prisma.user.findUnique({ where: { email: fields.email } });
    if (existing) {
      throw new Error("A user with this email already exists.");
    }
  }

  await prisma.user.update({
    where: { id },
    data: fields,
  });

  revalidatePath("/portal/admin/therapists");
  revalidatePath(`/portal/admin/therapists/${id}/edit`);
  redirect(`/portal/admin/therapists/${id}/edit?saved=1`);
}

export async function resetTherapistPasswordAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Therapist id is required.");

  const therapist = await prisma.user.findFirst({
    where: { id, role: "THERAPIST" },
    select: { id: true },
  });
  if (!therapist) throw new Error("Therapist not found.");

  let password = String(formData.get("password") ?? "").trim();
  if (!password) {
    password = generateOneTimePassword();
  } else if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });

  revalidatePath(`/portal/admin/therapists/${id}/edit`);
  redirect(`/portal/admin/therapists/${id}/edit?passwordReset=1`);
}

export async function deleteTherapistAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Therapist id is required.");

  const therapist = await prisma.user.findFirst({
    where: { id, role: "THERAPIST" },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!therapist) throw new Error("Therapist not found.");

  const invoiceCount = await prisma.invoice.count({ where: { therapistId: id } });
  if (invoiceCount > 0) {
    throw new Error(`Cannot delete: therapist has ${invoiceCount} invoice(s).`);
  }

  let driveWarning: string | undefined;
  try {
    const { accessToken } = await getSystemDriveAccessToken();
    await removeTherapistDriveFolder(accessToken, therapist);
  } catch (e) {
    driveWarning =
      e instanceof Error ? e.message : "Therapist Drive folder could not be removed.";
  }

  await prisma.$transaction(async (tx) => {
    await tx.client.updateMany({
      where: { therapistId: id },
      data: {
        therapistId: null,
        assignmentStatus: "UNASSIGNED",
      },
    });
    await tx.user.delete({ where: { id } });
  });

  revalidatePath("/portal/admin/therapists");
  revalidatePath("/portal/admin/clients");
  const params = new URLSearchParams({ deleted: "1" });
  if (driveWarning) params.set("driveWarning", driveWarning);
  redirect(`/portal/admin/therapists?${params.toString()}`);
}

export async function deactivateTherapistAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Therapist id is required.");

  const therapist = await prisma.user.findFirst({
    where: { id, role: "THERAPIST" },
    select: { id: true, active: true },
  });
  if (!therapist) throw new Error("Therapist not found.");
  if (!therapist.active) throw new Error("Therapist is already inactive.");

  await prisma.user.update({
    where: { id },
    data: { active: false },
  });

  revalidatePath("/portal/admin/therapists");
  revalidatePath(`/portal/admin/therapists/${id}/edit`);
  redirect(`/portal/admin/therapists/${id}/edit?deactivated=1`);
}

export async function reactivateTherapistAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Therapist id is required.");

  const therapist = await prisma.user.findFirst({
    where: { id, role: "THERAPIST" },
    select: { id: true, active: true },
  });
  if (!therapist) throw new Error("Therapist not found.");
  if (therapist.active) throw new Error("Therapist is already active.");

  await prisma.user.update({
    where: { id },
    data: { active: true },
  });

  revalidatePath("/portal/admin/therapists");
  revalidatePath(`/portal/admin/therapists/${id}/edit`);
  redirect(`/portal/admin/therapists/${id}/edit?reactivated=1`);
}

export async function deleteAdminAction(formData: FormData) {
  await requireAdmin();
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Admin id is required.");
  if (id === getRealUserId(session)) {
    throw new Error("You cannot delete your own account.");
  }

  const admin = await prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Admin not found.");

  await prisma.user.delete({ where: { id } });

  revalidatePath("/portal/admin/admins");
  redirect("/portal/admin/admins?deleted=1");
}

function parseAdminFields(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }

  return { firstName, lastName, email };
}

export type AdminFormState = { error?: string };

export async function createAdminAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requireAdmin();
    const fields = parseAdminFields(formData);
    const password = generateOneTimePassword();

    const existing = await prisma.user.findUnique({ where: { email: fields.email } });
    if (existing) {
      if (existing.role === "ADMIN") {
        return { error: "An admin with this email already exists." };
      }
      return {
        error:
          "This email belongs to a therapist account. Manage them from the Therapists page, or use a different email.",
      };
    }

    await prisma.user.create({
      data: {
        ...fields,
        role: "ADMIN",
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      },
    });

    let emailWarning: string | undefined;
    try {
      await sendAdminWelcomeEmail({
        adminEmail: fields.email,
        adminName: `${fields.firstName} ${fields.lastName}`,
        password,
        mustChangePassword: true,
      });
    } catch (e) {
      emailWarning = e instanceof Error ? e.message : "Welcome email could not be sent.";
    }

    revalidatePath("/portal/admin/admins");
    const params = new URLSearchParams({ created: "1" });
    if (emailWarning) params.set("emailWarning", emailWarning);
    redirect(`/portal/admin/admins?${params.toString()}`);
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return {
      error: e instanceof Error ? e.message : "Could not create admin.",
    };
  }
}

export async function updateAdminAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Admin id is required.");

  const admin = await prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("Admin not found.");

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }

  await prisma.user.update({
    where: { id },
    data: { firstName, lastName },
  });

  if (id === getRealUserId(session)) {
    await unstable_update({ user: { firstName, lastName } });
  }

  revalidatePath("/portal/admin/admins");
  revalidatePath(`/portal/admin/admins/${id}/edit`);
  redirect(`/portal/admin/admins/${id}/edit?saved=1`);
}

export async function resetAdminPasswordAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Admin id is required.");

  const admin = await prisma.user.findFirst({
    where: { id, role: "ADMIN" },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!admin) throw new Error("Admin not found.");

  const password = generateOneTimePassword();

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });

  try {
    await sendAdminWelcomeEmail({
      adminEmail: admin.email,
      adminName: `${admin.firstName} ${admin.lastName}`,
      password,
      mustChangePassword: true,
    });
  } catch (e) {
    console.error("Admin password reset email failed:", e);
  }

  revalidatePath(`/portal/admin/admins/${id}/edit`);
  redirect(`/portal/admin/admins/${id}/edit?passwordReset=1`);
}

export async function addClientNoteAction(formData: FormData) {
  const session = await requireSession();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/portal/admin/clients";
  const body = String(formData.get("body") ?? "").trim();

  if (!clientId) throw new Error("Client is required.");
  if (!body) throw new Error("Note cannot be empty.");

  const { assertClientNoteAccess } = await import("@/lib/client-notes");
  await assertClientNoteAccess(clientId, session);

  await prisma.clientNote.create({
    data: {
      clientId,
      authorId: getRealUserId(session),
      body,
    },
  });

  revalidateClientNotePaths(clientId, returnTo);

  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}noted=1`);
}

function revalidateClientNotePaths(clientId: string, returnTo: string) {
  revalidatePath(returnTo);
  revalidatePath(`/portal/admin/clients/${clientId}`);
  revalidatePath(`/portal/therapist/clients/${clientId}`);
  revalidatePath(`/portal/therapist/referrals/${clientId}`);
}

export async function updateClientNoteAction(formData: FormData) {
  const session = await requireSession();
  const noteId = String(formData.get("noteId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/portal/admin/clients";
  const body = String(formData.get("body") ?? "").trim();

  if (!noteId || !clientId) throw new Error("Note is required.");
  if (!body) throw new Error("Note cannot be empty.");

  const { assertCanModifyClientNote } = await import("@/lib/client-notes");
  const note = await assertCanModifyClientNote(noteId, session);
  if (note.clientId !== clientId) throw new Error("Note not found.");

  await prisma.clientNote.update({
    where: { id: noteId },
    data: { body },
  });

  revalidateClientNotePaths(clientId, returnTo);

  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}noteUpdated=1`);
}

export async function deleteClientNoteAction(formData: FormData) {
  const session = await requireSession();
  const noteId = String(formData.get("noteId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/portal/admin/clients";

  if (!noteId || !clientId) throw new Error("Note is required.");

  const { assertCanModifyClientNote } = await import("@/lib/client-notes");
  const note = await assertCanModifyClientNote(noteId, session);
  if (note.clientId !== clientId) throw new Error("Note not found.");

  await prisma.clientNote.delete({ where: { id: noteId } });

  revalidateClientNotePaths(clientId, returnTo);

  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}noteDeleted=1`);
}
