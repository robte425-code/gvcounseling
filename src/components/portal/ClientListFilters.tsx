import Link from "next/link";
import { buildClientListHref } from "@/lib/client-list-search";
import type { ClientStatusFilterOption } from "@/lib/client-list-ui";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

type Props = {
  basePath: string;
  query: string;
  status?: string;
  statusOptions: ClientStatusFilterOption[];
  resultCount: number;
  searchPlaceholder?: string;
};

export function ClientListFilters({
  basePath,
  query,
  status,
  statusOptions,
  resultCount,
  searchPlaceholder = "Search by claim # or name",
}: Props) {
  const clearHref = buildClientListHref(basePath, { status });
  const hasSearch = Boolean(query.trim());

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-primary/5 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={portalSectionHeadingClass}>Find clients</p>
          <p className="mt-1 text-sm text-muted">
            {resultCount} client{resultCount === 1 ? "" : "s"}
            {hasSearch ? ` matching “${query}”` : ""}
          </p>
        </div>
      </div>

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="w-full flex-1 sm:min-w-[220px]">
          <label htmlFor="client-search" className={portalLabelCompactClass}>
            Search
          </label>
          <input
            id="client-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={searchPlaceholder}
            className={portalInputCompactClass}
          />
        </div>
        <button type="submit" className={portalButtonClass}>
          Search
        </button>
        {hasSearch ? (
          <Link href={clearHref} className={portalButtonSecondaryClass}>
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
        {statusOptions.map((option) => {
          const href = buildClientListHref(basePath, {
            status: option.value,
            q: query || undefined,
          });
          const active = option.active;

          const pillClass = option.highlight && !active
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : active
              ? "border-primary bg-primary text-white shadow-sm"
              : "border-border bg-surface text-foreground hover:border-primary/40 hover:bg-primary/5";

          return (
            <Link
              key={`${option.label}-${option.value ?? "all"}`}
              href={href}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${pillClass}`}
            >
              <span>{option.label}</span>
              {option.count !== undefined ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    active ? "bg-white/20 text-white" : "bg-muted/15 text-muted"
                  }`}
                >
                  {option.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
