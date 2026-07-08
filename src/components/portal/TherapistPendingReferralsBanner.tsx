import Link from "next/link";
import { buildClientListHref } from "@/lib/client-list-search";
import { portalButtonClass } from "@/components/portal/ui";

type Props = {
  basePath: string;
  pendingCount: number;
  query: string;
};

export function TherapistPendingReferralsBanner({ basePath, pendingCount, query }: Props) {
  if (pendingCount === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/40 px-4 py-4 shadow-sm sm:px-5 sm:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Action needed
          </p>
          <p className="mt-1 font-serif text-lg font-semibold text-primary-dark">
            {pendingCount} referral{pendingCount === 1 ? "" : "s"} awaiting your review
          </p>
          <p className="mt-1 text-sm text-amber-900/80">
            Accept or decline new assignments so billing can move forward.
          </p>
        </div>
        <Link
          href={buildClientListHref(basePath, {
            status: "PENDING_THERAPIST",
            q: query || undefined,
          })}
          className={`${portalButtonClass} shrink-0 bg-amber-700 hover:bg-amber-800`}
        >
          Review referrals
        </Link>
      </div>
    </section>
  );
}
