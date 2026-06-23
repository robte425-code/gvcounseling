import { notFound } from "next/navigation";
import { requireAdmin } from "@/auth";
import { ClientForm } from "../new/page";
import { deleteClientAction } from "@/lib/portal-actions";
import { prisma } from "@/lib/prisma";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold text-primary-dark">Edit client</h1>
        <form action={deleteClientAction}>
          <input type="hidden" name="id" value={client.id} />
          <button type="submit" className="text-sm text-red-700 hover:underline">
            Delete client
          </button>
        </form>
      </div>
      <ClientForm client={client} />
    </div>
  );
}
