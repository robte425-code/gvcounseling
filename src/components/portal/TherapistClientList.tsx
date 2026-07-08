import Link from "next/link";
import { TherapistClientListItem } from "@/components/portal/TherapistClientListItem";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { buildClientListHref } from "@/lib/client-list-search";
import type { ClientListRow } from "@/lib/client-list-ui";

type Props = {
  clients: ClientListRow[];
  basePath: string;
  listReturnTo: string;
  emptyMessage: string;
  pendingCount: number;
  query: string;
};

export function TherapistClientList({
  clients,
  basePath,
  listReturnTo,
  emptyMessage,
  pendingCount,
  query,
}: Props) {
  if (clients.length === 0) {
    return (
      <section className={`${portalCardClass} border-dashed py-12 text-center`}>
        <p className="font-serif text-lg font-semibold text-primary-dark">No clients found</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{emptyMessage}</p>
        {pendingCount > 0 ? (
          <Link
            href={buildClientListHref(basePath, {
              status: "PENDING_THERAPIST",
              q: query || undefined,
            })}
            className={`${portalButtonClass} mt-6`}
          >
            Review {pendingCount} pending referral{pendingCount === 1 ? "" : "s"}
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <section className={`${portalCardClass} overflow-hidden p-0`}>
      <ul>
        {clients.map((client) => (
          <TherapistClientListItem
            key={client.id}
            client={client}
            basePath={basePath}
            returnTo={listReturnTo}
          />
        ))}
      </ul>
    </section>
  );
}
