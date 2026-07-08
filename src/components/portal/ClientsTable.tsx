import { ClientListStatusActions } from "@/components/portal/ClientListStatusActions";
import { ClientTableRow } from "@/components/portal/ClientTableRow";
import { TherapistClientQuickActions } from "@/components/portal/TherapistClientQuickActions";
import { StatusBadge, portalCardClass } from "@/components/portal/ui";
import { clientListLabel, type ClientListRow } from "@/lib/client-list-ui";

type Props = {
  clients: ClientListRow[];
  basePath: string;
  listReturnTo: string;
  variant: "admin" | "therapist";
  emptyMessage: string;
};

function ClientIdentityCell({ client }: { client: ClientListRow }) {
  return (
    <div className="min-w-[12rem]">
      <p className="font-medium text-primary-dark">{clientListLabel(client)}</p>
      <p className="mt-0.5 font-mono text-xs text-muted">{client.lniClaimNumber}</p>
    </div>
  );
}

export function ClientsTable({
  clients,
  basePath,
  listReturnTo,
  variant,
  emptyMessage,
}: Props) {
  if (clients.length === 0) {
    return (
      <div className={`${portalCardClass} border-dashed text-center`}>
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`${portalCardClass} overflow-hidden p-0`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/10 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-3 font-semibold">Client</th>
              {variant === "admin" ? (
                <th className="px-5 py-3 font-semibold">Therapist</th>
              ) : null}
              <th className="px-5 py-3 font-semibold">Status</th>
              {variant === "admin" ? (
                <th className="px-5 py-3 font-semibold">Invoices</th>
              ) : null}
              <th className="px-5 py-3 font-semibold">
                {variant === "admin" ? "Actions" : "Quick actions"}
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <ClientTableRow key={client.id} clientId={client.id} basePath={basePath}>
                <td className="px-5 py-4">
                  <ClientIdentityCell client={client} />
                </td>
                {variant === "admin" ? (
                  <td className="px-5 py-4 text-sm text-foreground">
                    {client.therapistName ?? (
                      <span className="text-muted">Unassigned</span>
                    )}
                  </td>
                ) : null}
                <td className="px-5 py-4">
                  <StatusBadge status={client.assignmentStatus} />
                </td>
                {variant === "admin" ? (
                  <td className="px-5 py-4 text-sm text-muted">
                    {client.invoiceCount ?? 0}
                  </td>
                ) : null}
                <td className="px-5 py-4">
                  {variant === "admin" ? (
                    <ClientListStatusActions
                      clientId={client.id}
                      clientLabel={clientListLabel(client)}
                      assignmentStatus={client.assignmentStatus}
                      invoiceCount={client.invoiceCount ?? 0}
                      returnTo={listReturnTo}
                    />
                  ) : (
                    <TherapistClientQuickActions
                      clientId={client.id}
                      assignmentStatus={client.assignmentStatus}
                    />
                  )}
                </td>
              </ClientTableRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
