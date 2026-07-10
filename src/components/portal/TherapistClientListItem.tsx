"use client";

import { useRouter } from "next/navigation";
import { TherapistClientQuickActions } from "@/components/portal/TherapistClientQuickActions";
import { StatusBadge } from "@/components/portal/ui";
import { clientListLabel, isNewClient } from "@/lib/client-list-ui";
import type { ClientListRow } from "@/lib/client-list-ui";
import type { ClientAssignmentStatus } from "@/generated/prisma/client";

type Props = {
  client: ClientListRow;
  basePath: string;
  returnTo: string;
};

function clientInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function avatarClass(status: ClientAssignmentStatus): string {
  switch (status) {
    case "PENDING_THERAPIST":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "CLOSED":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-primary/10 text-primary-dark ring-primary/20";
  }
}

function rowClass(status: ClientAssignmentStatus): string {
  switch (status) {
    case "PENDING_THERAPIST":
      return "border-l-4 border-l-amber-400 bg-amber-50/30";
    case "CLOSED":
      return "opacity-90";
    default:
      return "";
  }
}

export function TherapistClientListItem({ client, basePath, returnTo }: Props) {
  const router = useRouter();
  const href = `${basePath}/${client.id}`;
  const label = clientListLabel(client);

  function openClient() {
    router.push(href);
  }

  return (
    <li
      className={`group flex flex-col gap-4 border-b border-border/70 px-4 py-4 transition last:border-b-0 hover:bg-primary/[0.03] sm:flex-row sm:items-center sm:px-5 sm:py-5 ${rowClass(client.assignmentStatus)}`}
    >
      <button
        type="button"
        onClick={openClient}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ${avatarClass(client.assignmentStatus)}`}
          aria-hidden
        >
          {clientInitials(client.firstName, client.lastName)}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-primary-dark group-hover:text-primary">
              {label}
            </span>
            {isNewClient(client.createdAt) ? (
              <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">
                New client
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block font-mono text-xs text-muted">{client.lniClaimNumber}</span>
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <StatusBadge status={client.assignmentStatus} />
        <TherapistClientQuickActions
          clientId={client.id}
          clientLabel={label}
          assignmentStatus={client.assignmentStatus}
          returnTo={returnTo}
        />
      </div>
    </li>
  );
}
