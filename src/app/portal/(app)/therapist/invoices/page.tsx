import Link from "next/link";
import { requireTherapist } from "@/auth";
import { StatusBadge, portalButtonClass, portalCardClass } from "@/components/portal/ui";
import { formatCurrency, formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function TherapistInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireTherapist();
  const { status } = await searchParams;

  const invoices = await prisma.invoice.findMany({
    where: {
      therapistId: session.user.id,
      ...(status ? { status: status as "DRAFT" | "SUBMITTED" | "BILLED" } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { client: true },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Invoices</h1>
        <Link href="/portal/therapist/invoices/new" className={portalButtonClass}>
          New invoice
        </Link>
      </div>
      <div className={portalCardClass}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Client</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Updated</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-border/60">
                <td className="py-3 pr-4">{inv.invoiceNumber}</td>
                <td className="py-3 pr-4">
                  {inv.client.lastName}, {inv.client.firstName}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={inv.status} />
                </td>
                <td className="py-3 pr-4">{formatCurrency(Number(inv.totalAmount))}</td>
                <td className="py-3 pr-4">{formatDate(inv.updatedAt)}</td>
                <td className="py-3 text-right">
                  <Link href={`/portal/therapist/invoices/${inv.id}`} className="text-primary hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
