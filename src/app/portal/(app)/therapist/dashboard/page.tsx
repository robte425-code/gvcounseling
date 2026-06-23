import Link from "next/link";
import { requireTherapist } from "@/auth";
import { portalButtonClass, portalCardClass, StatusBadge } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function TherapistDashboardPage() {
  const session = await requireTherapist();
  const [draftCount, submittedCount, recent] = await Promise.all([
    prisma.invoice.count({ where: { therapistId: session.user.id, status: "DRAFT" } }),
    prisma.invoice.count({ where: { therapistId: session.user.id, status: "SUBMITTED" } }),
    prisma.invoice.findMany({
      where: { therapistId: session.user.id },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { client: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Dashboard</h1>
        <p className="mt-2 text-muted">Welcome, {session.user.firstName}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Draft invoices</p>
          <p className="mt-2 text-3xl font-semibold">{draftCount}</p>
        </div>
        <div className={portalCardClass}>
          <p className="text-sm text-muted">Submitted (awaiting bill)</p>
          <p className="mt-2 text-3xl font-semibold">{submittedCount}</p>
        </div>
      </div>
      <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
        New invoice
      </Link>
      <section className={portalCardClass}>
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Recent invoices</h2>
        <ul className="mt-4 divide-y divide-border">
          {recent.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-3">
              <Link href={`/portal/therapist/invoices/${inv.id}`} className="hover:underline">
                #{inv.invoiceNumber} · {inv.client.lastName}, {inv.client.firstName}
              </Link>
              <div className="flex items-center gap-3">
                <StatusBadge status={inv.status} />
                <span className="text-sm">{formatCurrency(Number(inv.totalAmount))}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
