import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({ where: { id } });
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

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "File storage is not configured (BLOB_READ_WRITE_TOKEN)." },
        { status: 503 },
      );
    }

    const blob = await put(`invoices/${id}/${file.name}`, file, { access: "public" });
    const attachment = await prisma.invoiceAttachment.create({
      data: {
        invoiceId: id,
        filename: file.name,
        blobUrl: blob.url,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      },
    });

    return NextResponse.json({ attachment });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
