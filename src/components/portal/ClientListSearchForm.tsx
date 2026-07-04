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
    <form method="get" className="flex flex-wrap items-end gap-3">
      {status ? <input type="hidden" name="status" value={status} /> : null}
      <div className="min-w-[240px] flex-1">
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
