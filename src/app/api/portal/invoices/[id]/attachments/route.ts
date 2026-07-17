import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import { formatServiceDateFolderName, calendarIsoFromDate } from "@/lib/constants";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { getOrCreateDriveSubfolder, uploadDriveFile } from "@/lib/google-drive";
import { prisma } from "@/lib/prisma";

function normalizeServiceDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

function lineItemServiceDateKey(date: Date): string {
  return calendarIsoFromDate(date);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { driveFolderId: true } },
        lineItems: { select: { serviceDate: true } },
      },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (session.user.role === "THERAPIST" && invoice.therapistId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (invoice.status !== "DRAFT") {
      return NextResponse.json({ error: "Only draft invoices accept attachments." }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const serviceDate = normalizeServiceDate(String(formData.get("serviceDate") ?? ""));
    if (!serviceDate) {
      return NextResponse.json({ error: "Select a service date." }, { status: 400 });
    }

    const allowedDates = new Set(invoice.lineItems.map((line) => lineItemServiceDateKey(line.serviceDate)));
    if (!allowedDates.has(serviceDate)) {
      return NextResponse.json(
        { error: "Service date must match a saved line on this invoice." },
        { status: 400 },
      );
    }

    if (!invoice.client.driveFolderId) {
      return NextResponse.json(
        { error: "This client has no Google Drive folder. Ask admin to sync the client from Drive." },
        { status: 400 },
      );
    }

    const accessToken = await getDriveAccessTokenForClient({
      therapistId: invoice.therapistId,
      initiatorUserId: session.user.id,
    });

    const folderName = formatServiceDateFolderName(serviceDate);
    const serviceDateFolderId = await getOrCreateDriveSubfolder(
      accessToken,
      invoice.client.driveFolderId,
      folderName,
    );

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadDriveFile(
      accessToken,
      serviceDateFolderId,
      file.name,
      buffer,
      file.type || undefined,
    );

    const attachment = await prisma.invoiceAttachment.create({
      data: {
        invoiceId: id,
        filename: file.name,
        blobUrl: uploaded.webViewLink,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      },
    });

    revalidatePath(`/portal/therapist/invoices/${id}`);
    revalidatePath("/portal/therapist/invoices/new");
    revalidatePath(`/portal/admin/invoices/${id}`);
    revalidatePath("/portal/admin/invoices");

    return NextResponse.json({
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        blobUrl: attachment.blobUrl,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
