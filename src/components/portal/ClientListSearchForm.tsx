import Link from "next/link";
import { buildClientListHref } from "@/lib/client-list-search";
import {
  portalButtonClass,
  portalInputCompactClass,
  portalLabelCompactClass,
} from "@/components/portal/ui";

type Props = {
  basePath: string;
  query: string;
  status?: string;
};

export function ClientListSearchForm({ basePath, query, status }: Props) {
  const clearHref = buildClientListHref(basePath, { status });

  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {status ? <input type="hidden" name="status" value={status} /> : null}
      <div className="w-full flex-1 sm:min-w-[240px]">
        <label htmlFor="client-search" className={portalLabelCompactClass}>
          Search
        </label>
        <input
          id="client-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Claim # or name"
          className={portalInputCompactClass}
        />
      </div>
      <button type="submit" className={portalButtonClass}>
        Search
      </button>
      {query ? (
        <Link href={clearHref} className={portalButtonClass}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}
