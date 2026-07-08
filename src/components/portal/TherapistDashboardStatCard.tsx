import Link from "next/link";
import { portalCardClass } from "@/components/portal/ui";

type Props = {
  href: string;
  label: string;
  value: string | number;
  hint?: string;
};

export function TherapistDashboardStatCard({ href, label, value, hint }: Props) {
  return (
    <Link
      href={href}
      className={`${portalCardClass} block min-w-0 transition hover:border-primary/30 hover:bg-primary/5`}
    >
      <p className="truncate text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-primary-dark sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-muted sm:text-sm">{hint}</p> : null}
    </Link>
  );
}
