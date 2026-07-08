import Link from "next/link";
import { requireAdmin } from "@/auth";
import { AdminForm } from "@/components/portal/AdminForm";
import { OutboundEmailTestingToggles } from "@/components/portal/OutboundEmailTestingToggles";
import { portalCardClass, portalTableNarrowClass, portalTableScrollClass } from "@/components/portal/ui";
import { getOutboundTestingSettings } from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";

export default async function AdminAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; deleted?: string; emailWarning?: string }>;
}) {
  await requireAdmin();
  const { created, deleted, emailWarning } = await searchParams;

  const [admins, outboundEmailSettings] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    getOutboundTestingSettings(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">Admin</h1>
        <p className="mt-2 text-muted">Manage billing portal administrator accounts.</p>
      </div>

      {created === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Admin added.
          {emailWarning
            ? ` Welcome email failed: ${emailWarning}.`
            : " A welcome email with a temporary password was sent."}
        </p>
      )}
      {deleted === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Admin deleted.
        </p>
      )}

      <OutboundEmailTestingToggles
        vrcRoute={outboundEmailSettings.vrcRoute}
        therapistRoute={outboundEmailSettings.therapistRoute}
        lniFaxRoute={outboundEmailSettings.lniFaxRoute}
        adminEmails={outboundEmailSettings.adminEmails}
      />

      <section className="space-y-4">
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Current admins</h2>
        <div className={portalCardClass}>
          <div className={portalTableScrollClass}>
            <table className={portalTableNarrowClass}>
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/portal/admin/admins/${admin.id}/edit`}
                      className="font-medium text-primary-dark hover:underline"
                    >
                      {admin.lastName}, {admin.firstName}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{admin.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {admins.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">No admins yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Add admin</h2>
        <AdminForm />
      </section>
    </div>
  );
}
