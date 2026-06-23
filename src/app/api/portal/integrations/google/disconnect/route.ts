import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  await prisma.googleDriveConnection.deleteMany({ where: { userId: auth.session.user.id } });

  return NextResponse.json({ ok: true });
}
