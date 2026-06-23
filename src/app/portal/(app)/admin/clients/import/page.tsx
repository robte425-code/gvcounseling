import Link from "next/link";
import { getRealUserId, requireAdmin } from "@/auth";
import { ClientImportForms } from "@/components/portal/ClientImportForms";
import { prisma } from "@/lib/prisma";

function safeDecodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function ClientImportPage({
  searchParams,
}: {
  searchParams: Promise<{ driveConnected?: string; driveError?: string }>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST" },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });

  let driveConnection: { googleEmail: string | null } | null = null;
  try {
    driveConnection = await prisma.googleDriveConnection.findUnique({
      where: { userId: getRealUserId(session) },
      select: { googleEmail: true },
    });
  } catch (e) {
    console.error("GoogleDriveConnection lookup failed:", e);
  }

  const driveMessage =
    params.driveConnected === "1"
      ? `Google Drive connected${driveConnection?.googleEmail ? ` as ${driveConnection.googleEmail}` : ""}.`
      : null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/portal/admin/clients" className="text-sm text-primary hover:underline">
          ← Back to clients
        </Link>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-primary-dark">Import clients</h1>
        <p className="mt-2 text-muted">
          Connect Google Drive to bulk-import Referral Submission documents, or upload files manually.
        </p>
      </div>
      <ClientImportForms
        therapists={therapists}
        driveStatus={{
          connected: Boolean(driveConnection),
          googleEmail: driveConnection?.googleEmail,
          message: driveMessage,
          error: params.driveError ? safeDecodeParam(params.driveError) : null,
        }}
      />
    </div>
  );
}
