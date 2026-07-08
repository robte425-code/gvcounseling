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
      className={`${portalCardClass} block transition hover:border-primary/30 hover:bg-primary/5`}
    >
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-primary-dark">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </Link>
  );
}
