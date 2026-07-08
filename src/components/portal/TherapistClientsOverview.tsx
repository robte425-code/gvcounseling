import Link from "next/link";
import { buildClientListHref } from "@/lib/client-list-search";
import { portalCardClass } from "@/components/portal/ui";

type OverviewCard = {
  label: string;
  count: number;
  status: string | undefined;
  active: boolean;
  highlight?: boolean;
  hint?: string;
};

type Props = {
  basePath: string;
  query: string;
  cards: OverviewCard[];
};

export function TherapistClientsOverview({ basePath, query, cards }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const href = buildClientListHref(basePath, {
          status: card.status,
          q: query || undefined,
        });

        const surfaceClass = card.highlight && !card.active
          ? "border-amber-300 bg-amber-50/80 hover:border-amber-400 hover:bg-amber-50"
          : card.active
            ? "border-primary bg-primary/5 ring-2 ring-primary/15 hover:border-primary"
            : "hover:border-primary/30 hover:bg-primary/5";

        return (
          <Link
            key={card.label}
            href={href}
            className={`${portalCardClass} block min-w-0 transition ${surfaceClass}`}
          >
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
              {card.label}
            </p>
            <p className="mt-2 font-serif text-2xl font-semibold text-primary-dark sm:text-3xl">
              {card.count}
            </p>
            {card.hint ? (
              <p className="mt-1 truncate text-xs text-muted sm:text-sm">{card.hint}</p>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
