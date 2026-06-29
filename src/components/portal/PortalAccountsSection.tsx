import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import {
  portalButtonClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  StatusBadge,
} from "@/components/portal/ui";
import { deletePortalAccountAction } from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

type PortalAccountsSectionProps = {
  currentUserId: string;
  query: string;
  deleted?: string;
};

export async function PortalAccountsSection({
  currentUserId,
  query,
  deleted,
}: PortalAccountsSectionProps) {
  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    include: {
      _count: { select: { clients: true, invoices: true, billsGenerated: true } },
    },
  });

  const searchAction = "/portal/profile";

  return (
    <section id="portal-logins" className="space-y-4 scroll-mt-8">
      <div>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Portal logins</h2>
        <p className="mt-1 text-sm text-muted">
          Every admin and therapist login. Admin accounts do not appear on the Therapists page.
        </p>
      </div>

      {deleted === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Account deleted.
        </p>
      )}

      <form method="get" action={searchAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="account-search" className={portalLabelCompactClass}>
            Search logins
          </label>
          <input
            id="account-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Email or name"
            className={portalInputCompactClass}
          />
        </div>
        <button type="submit" className={portalButtonClass}>
          Search
        </button>
        {query && (
          <Link href={searchAction} className={portalButtonClass}>
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
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Records</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isYou = user.id === currentUserId;
              const canDeleteAdmin =
                user.role === "ADMIN" && !isYou && user._count.billsGenerated === 0;
              return (
                <tr key={user.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4">
                    {user.lastName}, {user.firstName}
                    {isYou && <span className="ml-1 text-xs text-muted">(you)</span>}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{user.email}</td>
                  <td className="py-3 pr-4">{user.role === "ADMIN" ? "Admin" : "Therapist"}</td>
                  <td className="py-3 pr-4">
                    {user.role === "ADMIN" ? (
                      <span className="text-xs text-muted">—</span>
                    ) : user.active ? (
                      <span className="text-xs text-muted">Active</span>
                    ) : (
                      <StatusBadge status="INACTIVE" />
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted">
                    {user.role === "THERAPIST"
                      ? `${user._count.clients} clients · ${user._count.invoices} invoices`
                      : user._count.billsGenerated > 0
                        ? `${user._count.billsGenerated} bills generated`
                        : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {user.role === "THERAPIST" ? (
                      <Link
                        href={`/portal/admin/therapists/${user.id}/edit`}
                        className="text-primary-dark hover:underline"
                      >
                        Manage
                      </Link>
                    ) : canDeleteAdmin ? (
                      <form action={deletePortalAccountAction} className="inline">
                        <input type="hidden" name="id" value={user.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Delete admin account ${user.email}?`}
                          className="text-sm text-red-700 hover:underline"
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {query ? `No accounts match “${query}”.` : "No portal accounts found."}
          </p>
        )}
      </div>
    </section>
  );
}
