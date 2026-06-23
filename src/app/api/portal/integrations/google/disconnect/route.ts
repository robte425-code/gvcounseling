import { NextResponse } from "next/server";
import { getRealUserId, requireAdminApi } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  await prisma.googleDriveConnection.deleteMany({ where: { userId: getRealUserId(auth.session) } });

  return NextResponse.json({ ok: true });
}
