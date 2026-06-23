import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await requireAdmin();

  await prisma.googleDriveConnection.deleteMany({ where: { userId: session.user.id } });

  return NextResponse.json({ ok: true });
}
