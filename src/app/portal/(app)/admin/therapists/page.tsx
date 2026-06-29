import Link from "next/link";
import { requireAdmin } from "@/auth";
import { portalButtonClass, portalCardClass, portalInputCompactClass, portalLabelCompactClass, StatusBadge } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function AdminTherapistsPage({
  searchParams,
}: {
  searchParams: Promise<{
    deleted?: string;
    created?: string;
    reactivated?: string;
    driveWarning?: string;
    emailWarning?: string;
    q?: string;
  }>;
}) {
  await requireAdmin();
  const { deleted, created, reactivated, driveWarning, emailWarning, q } = await searchParams;
  const query = q?.trim() ?? "";

  const therapists = await prisma.user.findMany({
    where: {
      role: "THERAPIST",
      ...(query
        ? {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      googleDriveConnection: { select: { googleEmail: true } },
      _count: { select: { clients: true, invoices: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-primary-dark">Therapists</h1>
          <p className="mt-2 text-muted">
            Manage therapist accounts for the billing portal.{" "}
            <Link href="/portal/profile#portal-logins" className="text-primary hover:underline">
              View all portal logins
            </Link>{" "}
            on Admin (includes admin logins not shown here).
          </p>
        </div>
        <Link href="/portal/admin/therapists/new" className={portalButtonClass}>
          Add therapist
        </Link>
      </div>

      {deleted === "1" && !driveWarning && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Therapist deleted. Assigned clients are unassigned; their Drive folders were moved to New
          Referrals.
        </p>
      )}

      {deleted === "1" && driveWarning && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          Therapist deleted and assigned clients unassigned, but Drive folder cleanup failed:{" "}
          {driveWarning}
        </p>
      )}

      {reactivated === "1" && !driveWarning && !emailWarning && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Inactive therapist restored. Welcome email sent and Google Drive folder ensured.
        </p>
      )}

      {reactivated === "1" && (driveWarning || emailWarning) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          Inactive therapist restored.
          {emailWarning && ` Welcome email failed: ${emailWarning}.`}
          {driveWarning && ` Drive folder issue: ${driveWarning}.`}
        </p>
      )}

      {created === "1" && !driveWarning && !emailWarning && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Therapist added. Welcome email sent and Google Drive folder created.
        </p>
      )}

      {created === "1" && !driveWarning && emailWarning && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          Therapist added and Drive folder created, but the welcome email could not be sent:{" "}
          {emailWarning}
        </p>
      )}

      {created === "1" && driveWarning && !emailWarning && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          Therapist added and welcome email sent, but the Google Drive folder could not be created:{" "}
          {driveWarning}
        </p>
      )}

      {created === "1" && driveWarning && emailWarning && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">
          Therapist added, but the welcome email could not be sent ({emailWarning}) and the Google
          Drive folder could not be created ({driveWarning}).
        </p>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="therapist-search" className={portalLabelCompactClass}>
            Search
          </label>
          <input
            id="therapist-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Name or email"
            className={portalInputCompactClass}
          />
        </div>
        <button type="submit" className={portalButtonClass}>
          Search
        </button>
        {query && (
          <Link href="/portal/admin/therapists" className={portalButtonClass}>
            Clear
          </Link>
        )}
      </form>

      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">L&I ID</th>
              <th className="py-2 pr-4">NPI</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Clients</th>
              <th className="py-2 pr-4">Invoices</th>
              <th className="py-2 pr-4">Drive</th>
            </tr>
          </thead>
          <tbody>
            {therapists.map((t) => (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className="py-3 pr-4">
                  <Link
                    href={`/portal/admin/therapists/${t.id}/edit`}
                    className="font-medium text-primary-dark hover:underline"
                  >
                    {t.lastName}, {t.firstName}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-muted">{t.email}</td>
                <td className="py-3 pr-4 font-mono text-xs">{t.lniProviderId ?? "—"}</td>
                <td className="py-3 pr-4 font-mono text-xs">{t.npi ?? "—"}</td>
                <td className="py-3 pr-4">
                  {t.active ? (
                    <span className="text-xs text-muted">Active</span>
                  ) : (
                    <StatusBadge status="INACTIVE" />
                  )}
                </td>
                <td className="py-3 pr-4">{t._count.clients}</td>
                <td className="py-3 pr-4">{t._count.invoices}</td>
                <td className="py-3 pr-4 text-xs text-muted">
                  {t.googleDriveConnection?.googleEmail ?? "Not connected"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {therapists.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {query
              ? `No therapists match “${query}”.`
              : "No therapists yet. Add one to get started."}
          </p>
        )}
      </div>
    </div>
  );
}
