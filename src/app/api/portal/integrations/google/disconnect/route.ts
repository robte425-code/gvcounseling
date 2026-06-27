import { NextResponse } from "next/server";
import { getRealUserId, requirePortalDriveApi } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const auth = await requirePortalDriveApi();
  if (!auth.ok) return auth.response;

  await prisma.googleDriveConnection.deleteMany({ where: { userId: getRealUserId(auth.session) } });

  return NextResponse.json({ ok: true });
}
