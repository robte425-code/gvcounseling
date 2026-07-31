import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth, getRealRole, isImpersonating } from "@/auth";
import { prisma } from "@/lib/prisma";

async function getClientForPortalUser(clientId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      therapistId: true,
      attendingDoctorName: true,
    },
  });
  if (!client) {
    return { error: NextResponse.json({ error: "Client not found." }, { status: 404 }) };
  }

  const role = getRealRole(session);
  const admin = role === "ADMIN" && !isImpersonating(session);
  const therapist =
    session.user.role === "THERAPIST" && client.therapistId === session.user.id;

  if (!admin && !therapist) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { client };
}

function revalidateClientPaths(clientId: string) {
  revalidatePath(`/portal/admin/clients/${clientId}`);
  revalidatePath(`/portal/therapist/clients/${clientId}`);
  revalidatePath(`/portal/admin/clients/${clientId}/edit`);
  revalidatePath(`/portal/therapist/clients/${clientId}/edit`);
}

/** Manually set attending doctor name when referral OCR/import missed it (e.g. .docx). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await getClientForPortalUser(id);
  if ("error" in access) return access.error;
  const { client } = access;

  let body: { attendingDoctorName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const attendingDoctorName = String(body.attendingDoctorName ?? "").trim();
  if (!attendingDoctorName) {
    return NextResponse.json({ error: "Attending doctor name is required." }, { status: 400 });
  }
  if (attendingDoctorName.length > 200) {
    return NextResponse.json({ error: "Doctor name is too long." }, { status: 400 });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { attendingDoctorName },
  });

  revalidateClientPaths(client.id);
  return NextResponse.json({ attendingDoctorName });
}
