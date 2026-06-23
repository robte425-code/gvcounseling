import Link from "next/link";
import { requireAdmin } from "@/auth";
import { ClientImportForms } from "@/components/portal/ClientImportForms";
import { prisma } from "@/lib/prisma";

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

  const driveConnection = await prisma.googleDriveConnection.findUnique({
    where: { userId: session.user.id },
    select: { googleEmail: true },
  });

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
          error: params.driveError ? decodeURIComponent(params.driveError) : null,
        }}
      />
    </div>
  );
}
