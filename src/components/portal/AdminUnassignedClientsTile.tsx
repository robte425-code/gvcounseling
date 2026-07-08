import Link from "next/link";
import {
  portalCardClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { formatDate } from "@/lib/constants";

export type UnassignedClientRow = {
  id: string;
  firstName: string;
  lastName: string;
  lniClaimNumber: string;
  vrcName: string | null;
  createdAt: Date;
};

type Props = {
  clients: UnassignedClientRow[];
};

export function AdminUnassignedClientsTile({ clients }: Props) {
  if (clients.length === 0) return null;

  return (
    <section className={`${portalCardClass} border-amber-200 bg-amber-50/40`}>
      <p className={portalSectionHeadingClass}>Needs assignment</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">
        {clients.length} unassigned client{clients.length === 1 ? "" : "s"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        New referrals awaiting therapist assignment. Open a client to accept the referral and
        notify the VRC, or request more information.
      </p>

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-white/80">
        {clients.map((client) => (
          <li key={client.id}>
            <Link
              href={`/portal/admin/clients/${client.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition hover:bg-primary/5"
            >
              <div>
                <p className="font-medium text-primary-dark">
                  {client.lastName}, {client.firstName}
                </p>
                <p className="font-mono text-xs text-muted">{client.lniClaimNumber}</p>
                {client.vrcName && (
                  <p className="mt-1 text-xs text-muted">VRC: {client.vrcName}</p>
                )}
              </div>
              <p className="text-xs text-muted">Received {formatDate(client.createdAt)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
