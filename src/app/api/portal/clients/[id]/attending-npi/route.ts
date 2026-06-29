import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth, getRealRole, isImpersonating } from "@/auth";
import { searchAttendingNpiRegistry } from "@/lib/npi-registry";
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
      attendingNpi: true,
      attendingDoctorName: true,
      attendingDoctorAddress: true,
      attendingDoctorPhone: true,
      state: true,
      city: true,
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

  return { client, admin };
}

function revalidateClientPaths(clientId: string) {
  revalidatePath(`/portal/admin/clients/${clientId}`);
  revalidatePath(`/portal/therapist/clients/${clientId}`);
  revalidatePath(`/portal/admin/clients/${clientId}/edit`);
  revalidatePath(`/portal/therapist/clients/${clientId}/edit`);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await getClientForPortalUser(id);
  if ("error" in access) return access.error;
  const { client } = access;

  if (client.attendingNpi) {
    return NextResponse.json({ error: "Attending NPI is already set." }, { status: 400 });
  }
  if (!client.attendingDoctorName?.trim()) {
    return NextResponse.json(
      {
        error:
          "No attending doctor name on this client record. Re-sync from Drive or edit the client first.",
      },
      { status: 400 },
    );
  }

  const { providers, searchVariants, error } = await searchAttendingNpiRegistry({
    doctorName: client.attendingDoctorName,
    state: client.state,
    doctorPhone: client.attendingDoctorPhone,
  });

  if (error) {
    return NextResponse.json({ error, providers: [], searchVariants }, { status: 422 });
  }

  return NextResponse.json({
    providers,
    query: client.attendingDoctorName,
    searchVariants,
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await getClientForPortalUser(id);
  if ("error" in access) return access.error;
  const { client } = access;

  if (client.attendingNpi) {
    return NextResponse.json({ error: "Attending NPI is already set." }, { status: 400 });
  }

  let body: { npi?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const npi = String(body.npi ?? "").replace(/\D/g, "");
  if (npi.length !== 10) {
    return NextResponse.json({ error: "A valid 10-digit NPI is required." }, { status: 400 });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { attendingNpi: npi },
  });

  revalidateClientPaths(client.id);
  return NextResponse.json({ npi });
}
