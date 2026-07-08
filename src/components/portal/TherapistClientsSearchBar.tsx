import Link from "next/link";
import { buildClientListHref } from "@/lib/client-list-search";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputCompactClass,
} from "@/components/portal/ui";

type Props = {
  basePath: string;
  query: string;
  status?: string;
  resultCount: number;
};

export function TherapistClientsSearchBar({ basePath, query, status, resultCount }: Props) {
  const hasSearch = Boolean(query.trim());
  const clearHref = buildClientListHref(basePath, { status });

  return (
    <section className={`${portalCardClass} py-4 sm:py-5`}>
      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="relative min-w-0 flex-1">
          <label htmlFor="therapist-client-search" className="sr-only">
            Search clients
          </label>
          <input
            id="therapist-client-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search by name or claim number…"
            className={`${portalInputCompactClass} py-2.5 pl-4 pr-4`}
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="submit" className={`${portalButtonClass} px-5`}>
            Search
          </button>
          {hasSearch ? (
            <Link href={clearHref} className={portalButtonSecondaryClass}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>
      <p className="mt-3 text-sm text-muted">
        Showing {resultCount} client{resultCount === 1 ? "" : "s"}
        {hasSearch ? (
          <>
            {" "}
            matching <span className="font-medium text-foreground">“{query}”</span>
          </>
        ) : null}
      </p>
    </section>
  );
}
